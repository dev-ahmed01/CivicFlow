import { pipeline, env as transformersEnv } from "@huggingface/transformers";

if (process.env.PRELOAD_CLIP_MODEL !== "true") {
  console.log("[clip-cache] PRELOAD_CLIP_MODEL is not true; skipping model cache.");
  process.exit(0);
}

const modelId = process.env.CLIP_LOCAL_MODEL || "Xenova/clip-vit-base-patch32";
transformersEnv.cacheDir = process.env.CLIP_LOCAL_CACHE_DIR || ".cache/clip";
console.log(`[clip-cache] caching ${modelId} in ${transformersEnv.cacheDir}`);

const classifier = await pipeline("zero-shot-image-classification", modelId, { dtype: "q8" });
await classifier.dispose?.();

console.log("[clip-cache] model cached.");
