import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 30,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#34d399",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              background: "#34d399",
            }}
          />
          Non-profit · Mission-driven
        </div>

        <div
          style={{
            fontSize: 92,
            fontWeight: 800,
            marginTop: 28,
            lineHeight: 1.05,
          }}
        >
          VA CORP
        </div>

        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            marginTop: 16,
            maxWidth: 900,
            background: "linear-gradient(90deg, #34d399, #60a5fa, #a78bfa)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Equality &amp; sustainability in housing, education &amp; healthcare.
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: 48,
            fontSize: 28,
            color: "#cbd5e1",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "10px 24px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            🏡 Housing
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 24px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            📚 Education
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 24px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            ❤️ Healthcare
          </div>
        </div>
      </div>
    ),
    size
  );
}
