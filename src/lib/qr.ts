import QRCode from "qrcode";

// Render a QR to a data URL. Uses error-correction M and no margin so cards
// stay compact. Tokens are uppercase alphanumeric -> small QR (version <= 2).
export async function qrDataUrl(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
