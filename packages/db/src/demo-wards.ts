export const DEMO_WARD_SRID = 4326;

export type DemoWard = {
  id: string;
  name: string;
  boundary: readonly (readonly [longitude: number, latitude: number])[];
  representativeCoordinates: {
    latitude: number;
    longitude: number;
  };
};

export const demoWardIds = {
  koramangala: "10000000-0000-4000-8000-000000000001",
  indiranagar: "10000000-0000-4000-8000-000000000002",
  hsrLayout: "10000000-0000-4000-8000-000000000003",
  jayanagar: "10000000-0000-4000-8000-000000000004",
  btmLayout: "10000000-0000-4000-8000-000000000005",
  jpNagar: "10000000-0000-4000-8000-000000000006",
  bannerghattaRoad: "10000000-0000-4000-8000-000000000007",
  bellandur: "10000000-0000-4000-8000-000000000008",
  marathahalli: "10000000-0000-4000-8000-000000000009",
  electronicCity: "10000000-0000-4000-8000-000000000010",
} as const;

// Part III §7.1/§20 — demo defaults only. Runtime ward boundaries remain
// database-backed and admin-editable. Small gaps keep ST_Covers deterministic at
// the edges instead of turning the demo into one city-wide reporting polygon.
export const demoWards = [
  {
    id: demoWardIds.koramangala,
    name: "Koramangala",
    boundary: [[77.6100, 12.9250], [77.6350, 12.9250], [77.6350, 12.9500], [77.6100, 12.9500], [77.6100, 12.9250]],
    representativeCoordinates: { latitude: 12.9352, longitude: 77.6245 },
  },
  {
    id: demoWardIds.indiranagar,
    name: "Indiranagar",
    boundary: [[77.6250, 12.9650], [77.6550, 12.9650], [77.6550, 12.9900], [77.6250, 12.9900], [77.6250, 12.9650]],
    representativeCoordinates: { latitude: 12.9784, longitude: 77.6408 },
  },
  {
    id: demoWardIds.hsrLayout,
    name: "HSR Layout",
    boundary: [[77.6250, 12.8950], [77.6550, 12.8950], [77.6550, 12.9250], [77.6250, 12.9250], [77.6250, 12.8950]],
    representativeCoordinates: { latitude: 12.9116, longitude: 77.6389 },
  },
  {
    id: demoWardIds.jayanagar,
    name: "Jayanagar",
    boundary: [[77.5650, 12.9150], [77.6000, 12.9150], [77.6000, 12.9450], [77.5650, 12.9450], [77.5650, 12.9150]],
    representativeCoordinates: { latitude: 12.9299, longitude: 77.5844 },
  },
  {
    id: demoWardIds.btmLayout,
    name: "BTM Layout",
    boundary: [[77.6010, 12.8960], [77.6240, 12.8960], [77.6240, 12.9240], [77.6010, 12.9240], [77.6010, 12.8960]],
    representativeCoordinates: { latitude: 12.9166, longitude: 77.6101 },
  },
  {
    id: demoWardIds.jpNagar,
    name: "JP Nagar",
    boundary: [[77.5650, 12.8800], [77.5930, 12.8800], [77.5930, 12.9140], [77.5650, 12.9140], [77.5650, 12.8800]],
    representativeCoordinates: { latitude: 12.9063, longitude: 77.5857 },
  },
  {
    id: demoWardIds.bannerghattaRoad,
    name: "Bannerghatta Road",
    boundary: [[77.5940, 12.8580], [77.6160, 12.8580], [77.6160, 12.8940], [77.5940, 12.8940], [77.5940, 12.8580]],
    representativeCoordinates: { latitude: 12.8873, longitude: 77.5970 },
  },
  {
    id: demoWardIds.bellandur,
    name: "Bellandur",
    boundary: [[77.6570, 12.9120], [77.6890, 12.9120], [77.6890, 12.9440], [77.6570, 12.9440], [77.6570, 12.9120]],
    representativeCoordinates: { latitude: 12.9304, longitude: 77.6784 },
  },
  {
    id: demoWardIds.marathahalli,
    name: "Marathahalli",
    boundary: [[77.6910, 12.9450], [77.7170, 12.9450], [77.7170, 12.9730], [77.6910, 12.9730], [77.6910, 12.9450]],
    representativeCoordinates: { latitude: 12.9591, longitude: 77.6974 },
  },
  {
    id: demoWardIds.electronicCity,
    name: "Electronic City",
    boundary: [[77.6550, 12.8250], [77.7000, 12.8250], [77.7000, 12.8550], [77.6550, 12.8550], [77.6550, 12.8250]],
    representativeCoordinates: { latitude: 12.8399, longitude: 77.6770 },
  },
] as const satisfies readonly DemoWard[];

export function demoWardBoundaryWkt(ward: DemoWard): string {
  return `POLYGON((${ward.boundary.map(([longitude, latitude]) => `${longitude} ${latitude}`).join(",")}))`;
}
