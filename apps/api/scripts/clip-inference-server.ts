import { AutoProcessor, AutoTokenizer, CLIPModel, RawImage, env as transformersEnv } from "@huggingface/transformers";
import express from "express";

type Category = { id: string; name: string; prompt: string };

const categories: Category[] = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Road Damage", prompt: "a pothole, damaged road, cracked pavement, or broken asphalt" },
  { id: "30000000-0000-4000-8000-000000000002", name: "Streetlight", prompt: "a damaged, broken, leaning, or non-working street light" },
  { id: "30000000-0000-4000-8000-000000000003", name: "Water Supply", prompt: "water leakage, a broken water pipe, flooding, or standing water" },
  { id: "30000000-0000-4000-8000-000000000004", name: "Drainage/Sewage", prompt: "an overflowing drain, blocked storm drain, open sewer, or sewage spill" },
  { id: "30000000-0000-4000-8000-000000000005", name: "Garbage/Waste", prompt: "dumped garbage, litter, an overflowing trash bin, or solid waste" },
  { id: "30000000-0000-4000-8000-000000000006", name: "Electrical Hazard", prompt: "exposed electrical wires, a fallen power line, sparking equipment, or an electrical hazard" },
  { id: "30000000-0000-4000-8000-000000000007", name: "Public Toilet", prompt: "a damaged, dirty, blocked, or unusable public toilet" },
  { id: "30000000-0000-4000-8000-000000000008", name: "Parks & Trees", prompt: "a fallen or hazardous tree, damaged park equipment, or neglected public park" },
  { id: "30000000-0000-4000-8000-000000000009", name: "Stray Animals", prompt: "stray dogs, cattle, or other unattended animals in a public place" },
  { id: "30000000-0000-4000-8000-000000000010", name: "Illegal Construction", prompt: "unauthorized construction, building work obstructing a public area, or construction debris" },
  { id: "30000000-0000-4000-8000-000000000011", name: "Traffic & Signage", prompt: "a damaged traffic sign, broken signal, missing road sign, or traffic obstruction" },
  { id: "30000000-0000-4000-8000-000000000012", name: "Other", prompt: "a visible civic infrastructure problem in a public place" },
];

const unrelatedPrompts = [
  "an ordinary wall, room, furniture, or building interior with no visible civic issue",
  "a selfie, portrait, face, or posed photo of a person",
  "food, a meal, a drink, groceries, or a restaurant dish",
  "a screenshot, meme, poster, document, advertisement, or computer interface",
];

const modelId = process.env.CLIP_LOCAL_MODEL || "Xenova/clip-vit-base-patch32";
const cacheDir = process.env.CLIP_LOCAL_CACHE_DIR || ".cache/clip";
transformersEnv.cacheDir = cacheDir;

function promptsForCategory(selected: Category): string[] {
  return [
    `${selected.name}: ${selected.prompt}`,
    "a different civic infrastructure issue than the selected category, such as garbage, streetlight, water leak, drain, electrical hazard, public toilet, tree, stray animal, construction, or traffic signage",
    ...unrelatedPrompts,
  ];
}

function softmax(values: number[]): number[] {
  if (!values.length) return [];
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : [];
}

function relativeConfidence(selected: number, competitor: number): number {
  const total = selected + competitor;
  return total > 0 ? selected / total : 0;
}

const runtimePromise = Promise.all([
  AutoTokenizer.from_pretrained(modelId),
  AutoProcessor.from_pretrained(modelId),
  CLIPModel.from_pretrained(modelId, { dtype: "q8" }),
]);

let ready = false;
let warmupError: string | null = null;
runtimePromise.then(() => {
  ready = true;
  console.log(`[clip] model ready: ${modelId}`);
}).catch((error) => {
  warmupError = error instanceof Error ? error.message : String(error);
  console.error("[clip] model warmup failed", warmupError);
});

const cache = new Map<string, { expiresAt: number; body: unknown }>();
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.status(warmupError ? 503 : 200).json({
    status: warmupError ? "error" : ready ? "ok" : "warming",
    model: modelId,
  });
});

app.post("/infer", async (request, response) => {
  const configuredToken = process.env.CLIP_INFERENCE_TOKEN;
  if (configuredToken && request.get("authorization") !== `Bearer ${configuredToken}`) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const imageUrl = typeof request.body?.imageUrl === "string" ? request.body.imageUrl : "";
  const categoryId = typeof request.body?.categoryId === "string" ? request.body.categoryId : "";
  const selectedIndex = categories.findIndex((category) => category.id === categoryId);
  if (!imageUrl || selectedIndex < 0) {
    response.status(400).json({ error: "imageUrl and a supported categoryId are required" });
    return;
  }

  const cacheKey = `${categoryId}|${imageUrl}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    response.json(cached.body);
    return;
  }

  try {
    const startedAt = Date.now();
    const [tokenizer, processor, model] = await runtimePromise;
    const selectedCategory = categories[selectedIndex]!;
    const prompts = promptsForCategory(selectedCategory);
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(6000) });
    if (!imageResponse.ok) throw new Error(`image download returned ${imageResponse.status}`);
    const contentType = imageResponse.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
    if (!contentType.startsWith("image/")) throw new Error("downloaded object is not an image");
    const bytes = await imageResponse.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("image is empty or too large");

    const raw = await RawImage.fromBlob(new Blob([bytes], { type: contentType }));
    const textInputs = tokenizer(prompts, { padding: true, truncation: true });
    const imageInputs = await processor(raw);
    const output = await model({ ...textInputs, ...imageInputs }) as unknown as {
      logits_per_image: { data: ArrayLike<number> };
      image_embeds: { data: ArrayLike<number> };
    };

    const scores = softmax(Array.from(output.logits_per_image.data));
    const embedding = normalize(Array.from(output.image_embeds.data));
    const selectedScore = scores[0] ?? 0;
    const bestOtherCategory = scores[1] ?? 0;
    const bestUnrelated = Math.max(0, ...scores.slice(2));
    const strongestCompetitor = Math.max(bestOtherCategory, bestUnrelated);
    const score = relativeConfidence(selectedScore, strongestCompetitor);

    let pass = selectedScore >= strongestCompetitor;
    let reason: "MATCH" | "CATEGORY_MISMATCH" | "UNRELATED_CONTENT" | "LOW_CONFIDENCE" = "MATCH";
    if (!pass) {
      const competitorConfidence = 1 - score;
      if (competitorConfidence < 0.58) reason = "LOW_CONFIDENCE";
      else reason = bestUnrelated >= bestOtherCategory ? "UNRELATED_CONTENT" : "CATEGORY_MISMATCH";
    }

    const body = {
      score,
      pass,
      reason,
      embedding,
      model: modelId,
      processingMs: Date.now() - startedAt,
    };
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, body });
    response.json(body);
  } catch (error) {
    console.error("[clip] inference failed", error);
    response.status(503).json({ error: "Inference unavailable" });
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => {
  console.log(`[clip] inference service listening on ${port}; warming ${modelId}`);
});
