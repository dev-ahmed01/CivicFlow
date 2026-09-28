import { AutoProcessor, AutoTokenizer, CLIPModel, env as transformersEnv } from "@huggingface/transformers";

if (process.env.PRELOAD_CLIP_MODEL !== "true") {
  console.log("[clip-cache] PRELOAD_CLIP_MODEL is not true; skipping model cache.");
  process.exit(0);
}

const modelId = process.env.CLIP_LOCAL_MODEL || "Xenova/clip-vit-base-patch32";
transformersEnv.cacheDir = process.env.CLIP_LOCAL_CACHE_DIR || ".cache/clip";
console.log(`[clip-cache] caching ${modelId} in ${transformersEnv.cacheDir}`);

await Promise.all([
  AutoTokenizer.from_pretrained(modelId),
  AutoProcessor.from_pretrained(modelId),
  CLIPModel.from_pretrained(modelId, { dtype: "q8" }),
]);

console.log("[clip-cache] model cached.");
