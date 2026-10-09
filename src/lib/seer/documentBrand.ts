import logoAsset from "@/assets/navin-dna-logo.png.asset.json";

export const DOCUMENT_BRAND = {
  name: "BASE PAIRING", gold: "B38B34", ink: "171717", muted: "595959",
  footer: "Base Pairing · SEER.ai · Claudian Navin Stanislaus",
};

export async function documentLogo(): Promise<Uint8Array> {
  const response = await fetch(logoAsset.url);
  if (!response.ok) throw new Error("The Base Pairing logo could not be loaded. Please retry the download.");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = 180; canvas.height = Math.round(180 * bitmap.height / bitmap.width);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Document image conversion is unavailable in this browser.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Logo conversion failed.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}