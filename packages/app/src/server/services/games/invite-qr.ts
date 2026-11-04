import QRCode from "qrcode";

/** The quiet zone a QR code needs around it, in modules (ISO/IEC 18004). */
const QUIET_ZONE_MODULES = 4;

/**
 * The QR code of `text` as an SVG document, made here so the link never reaches an outside service
 * (D-35). The colours are fixed: dark modules on a light background with its quiet zone, in both
 * themes, because a reader needs that contrast whatever the page around it looks like.
 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: QUIET_ZONE_MODULES,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
