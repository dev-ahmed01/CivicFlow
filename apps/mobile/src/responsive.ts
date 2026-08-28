export type Viewport = {
  width: number;
  height: number;
  fontScale: number;
};

export type ResponsiveMetrics = {
  compactHeight: boolean;
  horizontalPadding: number;
  mediaMaxHeight: number;
  narrow: boolean;
};

// Mobile layout breakpoints are based on usable viewport space and font scale,
// not Android versions or individual device models.
export function responsiveMetrics({ width, height, fontScale }: Viewport): ResponsiveMetrics {
  const narrow = width < 380 || fontScale >= 1.3;
  const compactHeight = height < 700 || fontScale >= 1.3;
  return {
    compactHeight,
    horizontalPadding: width <= 360 || fontScale >= 1.3 ? 16 : width <= 412 ? 18 : 20,
    mediaMaxHeight: compactHeight ? 220 : width <= 360 ? 250 : 290,
    narrow,
  };
}
