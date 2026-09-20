import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await params;
  const size = rawSize === "192" ? 192 : 512;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08100f",
          borderRadius: size === 192 ? 36 : 96,
          padding: size === 192 ? 20 : 54,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: "#131f1d",
            border: `${Math.max(5, Math.round(size * 0.025))}px solid #f2eee7`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "72%",
              height: "72%",
              borderRadius: "50%",
              border: `${Math.max(6, Math.round(size * 0.032))}px solid #44e0b0`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0b1413",
            }}
          >
            <div
              style={{
                fontSize: Math.round(size * 0.19),
                fontWeight: 900,
                letterSpacing: -Math.round(size * 0.012),
                color: "#f4f8f7",
              }}
            >
              VDC
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              width: Math.max(14, Math.round(size * 0.075)),
              height: Math.max(14, Math.round(size * 0.075)),
              borderRadius: "50%",
              background: "#44e0b0",
            }}
          />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    },
  );
}
