import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env as transformersEnv,
} from "@huggingface/transformers";

if (process.env.PRELOAD_CLIP_MODEL !== "true") {
  console.log("[clip-cache] PRELOAD_CLIP_MODEL is not true; skipping model cache.");
  process.exit(0);
}

const modelId = process.env.CLIP_LOCAL_MODEL || "Xenova/mobileclip_s0";
transformersEnv.cacheDir = process.env.CLIP_LOCAL_CACHE_DIR || ".cache/clip";
console.log(`[clip-cache] caching ${modelId} in ${transformersEnv.cacheDir}`);

const [tokenizer, textModel, processor, visionModel] = await Promise.all([
  AutoTokenizer.from_pretrained(modelId),
  CLIPTextModelWithProjection.from_pretrained(modelId, { dtype: "q8" }),
  AutoProcessor.from_pretrained(modelId),
  CLIPVisionModelWithProjection.from_pretrained(modelId, { dtype: "fp32" }),
]);

void tokenizer;
void processor;
await textModel.dispose?.();
await visionModel.dispose?.();

console.log("[clip-cache] MobileCLIP text and vision models cached.");
