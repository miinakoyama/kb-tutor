export interface ChartThemeColors {
  grid: string;
  axis: string;
  primary: string;
  surface: string;
  foreground: string;
}

const LIGHT_CHART_COLORS: ChartThemeColors = {
  grid: "rgba(31, 45, 31, 0.12)",
  axis: "rgba(31, 45, 31, 0.55)",
  primary: "#16a34a",
  surface: "#ffffff",
  foreground: "#1f2d1f",
};

const DARK_CHART_COLORS: ChartThemeColors = {
  grid: "rgba(232, 240, 234, 0.12)",
  axis: "rgba(232, 240, 234, 0.55)",
  primary: "#22c55e",
  surface: "#152018",
  foreground: "#e8f0ea",
};

export function getChartThemeColors(resolvedTheme: "light" | "dark"): ChartThemeColors {
  if (typeof window === "undefined") {
    return resolvedTheme === "dark" ? DARK_CHART_COLORS : LIGHT_CHART_COLORS;
  }

  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };

  if (resolvedTheme === "dark") {
    return {
      grid: read("--chart-grid", "rgba(232, 240, 234, 0.12)"),
      axis: read("--chart-axis", "rgba(232, 240, 234, 0.55)"),
      primary: read("--primary", "#22c55e"),
      surface: read("--surface", "#152018"),
      foreground: read("--foreground", "#e8f0ea"),
    };
  }

  return {
    grid: read("--chart-grid", LIGHT_CHART_COLORS.grid),
    axis: read("--chart-axis", LIGHT_CHART_COLORS.axis),
    primary: read("--primary", LIGHT_CHART_COLORS.primary),
    surface: read("--surface", LIGHT_CHART_COLORS.surface),
    foreground: read("--foreground", LIGHT_CHART_COLORS.foreground),
  };
}
