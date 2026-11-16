import { useMemo } from "react";
import HeatMap from "@uiw/react-heat-map";

// Demo activity for the last ~6 months (replace with real commit data later).
const generateActivityData = (start, end) => {
  const data = [];
  const d = new Date(start);
  while (d <= end) {
    data.push({ date: d.toISOString().split("T")[0], count: Math.floor(Math.random() * 6) });
    d.setDate(d.getDate() + 1);
  }
  return data;
};

const PANEL_COLORS = { 0: "#161b22", 1: "#0e4429", 2: "#006d32", 3: "#26a641", 4: "#39d353" };

const HeatMapProfile = () => {
  const { data, start } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 6);
    return { data: generateActivityData(start, end), start };
  }, []);

  return (
    <div className="heatmap-box card">
      <h4>Recent contributions</h4>
      <div className="heatmap-scroll">
        <HeatMap
          value={data}
          startDate={start}
          weekLabels={["", "Mon", "", "Wed", "", "Fri", ""]}
          rectSize={13}
          space={3}
          style={{ color: "#8b949e", minWidth: 640 }}
          rectProps={{ rx: 2 }}
          panelColors={PANEL_COLORS}
        />
      </div>
    </div>
  );
};

export default HeatMapProfile;
