import React, { useState } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
} from 'react-native-svg';

const PIN_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' +
  'm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeWedge(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export default function MultiColorPin({
  colors,
  size = 34,
  shadow = true,
}: {
  colors: string[];
  size?: number;
  shadow?: boolean;
}) {
  const [clipId] = useState(
    () => `pin-clip-${Math.random().toString(36).slice(2, 10)}`,
  );

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerWhiteR = outerR * 0.6;
  const pinSize = innerWhiteR * 1.7;
  const pinScale = pinSize / 24;

  const startOffset = -Math.PI / 2; // first wedge at 12 o'clock
  const n = Math.max(colors.length, 1);
  const sliceAngle = (2 * Math.PI) / n;

  return (
    <Svg width={size} height={size}>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={cx} cy={cy} r={outerR} />
        </ClipPath>
      </Defs>


      {shadow && (
        <Circle cx={cx} cy={cy + 1.5} r={outerR} fill="rgba(0,0,0,0.18)" />
      )}


      <Circle cx={cx} cy={cy} r={outerR} fill="#888" />

      <G clipPath={`url(#${clipId})`}>
        {colors.length === 0 ? (
          <Circle cx={cx} cy={cy} r={outerR} fill="#888" />
        ) : colors.length === 1 ? (
          <Circle cx={cx} cy={cy} r={outerR} fill={colors[0]} />
        ) : (
          <>
            {colors.map((color, i) => {
              const start = startOffset + i * sliceAngle;
              const end = start + sliceAngle;
              return (
                <Path
                  key={`w-${i}`}
                  d={describeWedge(cx, cy, outerR + 1, start, end)}
                  fill={color}
                />
              );
            })}
            {colors.map((_, i) => {
              const start = startOffset + i * sliceAngle;
              const { x, y } = polarToCartesian(cx, cy, outerR + 1, start);
              return (
                <Line
                  key={`d-${i}`}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="#fff"
                  strokeWidth={1.5}
                  opacity={0.75}
                />
              );
            })}
          </>
        )}
      </G>

      <Circle
        cx={cx}
        cy={cy}
        r={outerR}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
      />

      <Circle cx={cx} cy={cy} r={innerWhiteR} fill="#fff" />

      <G
        transform={`translate(${cx - pinSize / 2}, ${cy - pinSize / 2}) scale(${pinScale})`}
      >
        <Path d={PIN_PATH} fill="#333" fillRule="evenodd" />
      </G>
    </Svg>
  );
}