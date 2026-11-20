import { downscaleImageFile, validateImageFile } from './imagePipeline'

export const MOMENT_IMAGE_LIMITS = {
  maxSourceBytes: 10 * 1024 * 1024,
  maxSide: 1280,
  jpegQuality: 0.8,
}

export function validateMomentFile(file) {
  return validateImageFile(file, MOMENT_IMAGE_LIMITS)
}

export async function downscaleMomentImage(file) {
  return downscaleImageFile(file, MOMENT_IMAGE_LIMITS)
}
