"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { CivicWorkCalendarItem, CivicWorkGeometry } from "@civicos/shared";

type MapBounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
type Coordinate = [number, number];

const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
const periodColors = { PAST: "#718078", CURRENT: "#14823b", FUTURE: "#1f68a9" } as const;

function geometryCoordinates(geometry: CivicWorkGeometry): Coordinate[] {
  if (geometry.type === "Point") return [geometry.coordinates as Coordinate];
  if (geometry.type === "LineString") return geometry.coordinates as Coordinate[];
  return geometry.coordinates.flat() as Coordinate[];
}

export function workAnchor(geometry: CivicWorkGeometry): Coordinate {
  const coordinates = geometryCoordinates(geometry);
  const total = coordinates.reduce((sum, [longitude, latitude]) => [sum[0] + longitude, sum[1] + latitude] as Coordinate, [0, 0]);
  return [total[0] / coordinates.length, total[1] / coordinates.length];
}

function workCollections(works: CivicWorkCalendarItem[], selectedId?: string) {
  return {
    geometries: {
      type: "FeatureCollection" as const,
      features: works.map((work) => ({
        type: "Feature" as const,
        geometry: work.geometry,
        properties: { id: work.id, period: work.period, color: periodColors[work.period], selected: work.id === selectedId ? 1 : 0 },
      })),
    },
    anchors: {
      type: "FeatureCollection" as const,
      features: works.map((work) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: workAnchor(work.geometry) },
        properties: { id: work.id, period: work.period, color: periodColors[work.period], selected: work.id === selectedId ? 1 : 0, title: work.title },
      })),
    },
  };
}

function fitToWorks(map: MapLibreMap, works: CivicWorkCalendarItem[]): void {
  const coordinates = works.flatMap(({ geometry }) => geometryCoordinates(geometry));
  if (coordinates.length === 0) return;
  let minLongitude = coordinates[0]![0];
  let maxLongitude = minLongitude;
  let minLatitude = coordinates[0]![1];
  let maxLatitude = minLatitude;
  for (const [longitude, latitude] of coordinates) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }
  if (minLongitude === maxLongitude && minLatitude === maxLatitude) {
    map.easeTo({ center: [minLongitude, minLatitude], zoom: 14 });
    return;
  }
  map.fitBounds([[minLongitude, minLatitude], [maxLongitude, maxLatitude]], { padding: 68, maxZoom: 14, duration: 500 });
}

export function WorkMap({ works, selectedId, bounds, onSelect, onBoundsChange }: {
  works: CivicWorkCalendarItem[];
  selectedId?: string;
  bounds: MapBounds;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialBoundsRef = useRef(bounds);
  const mapRef = useRef<MapLibreMap>();
  const onSelectRef = useRef(onSelect);
  const worksRef = useRef(works);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoved, setMapMoved] = useState(false);
  const [mapError, setMapError] = useState(false);
  const collections = useMemo(() => workCollections(works, selectedId), [selectedId, works]);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { worksRef.current = works; }, [works]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialBounds = initialBoundsRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      bounds: [[initialBounds.minLongitude, initialBounds.minLatitude], [initialBounds.maxLongitude, initialBounds.maxLatitude]],
      fitBoundsOptions: { padding: 36 },
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.once("load", () => {
      const initial = workCollections(worksRef.current);
      map.addSource("civic-work-geometry", { type: "geojson", data: initial.geometries });
      map.addSource("civic-work-anchor", { type: "geojson", data: initial.anchors, cluster: true, clusterMaxZoom: 11, clusterRadius: 45 });
      map.addLayer({ id: "work-polygons", type: "fill", source: "civic-work-geometry", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18, "fill-outline-color": ["get", "color"] } });
      map.addLayer({ id: "work-lines", type: "line", source: "civic-work-geometry", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "selected"], 1], 7, 4], "line-opacity": 0.82 } });
      map.addLayer({ id: "work-clusters", type: "circle", source: "civic-work-anchor", filter: ["has", "point_count"], paint: { "circle-color": "#173f2a", "circle-radius": ["step", ["get", "point_count"], 18, 10, 23, 30, 28], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
      map.addLayer({ id: "work-cluster-count", type: "symbol", source: "civic-work-anchor", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#ffffff" } });
      map.addLayer({ id: "work-anchors", type: "circle", source: "civic-work-anchor", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["get", "color"], "circle-radius": ["case", ["==", ["get", "selected"], 1], 10, 7], "circle-stroke-color": "#ffffff", "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 4, 2] } });
      map.on("click", "work-anchors", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      });
      map.on("click", "work-clusters", (event) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates as Coordinate : null;
        const source = map.getSource("civic-work-anchor") as GeoJSONSource;
        if (coordinates && Number.isFinite(clusterId)) void source.getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center: coordinates, zoom }));
      });
      for (const layer of ["work-anchors", "work-clusters"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      setMapReady(true);
      fitToWorks(map, worksRef.current);
    });
    map.on("moveend", () => setMapMoved(true));
    map.on("error", () => setMapError(true));
    return () => { map.remove(); mapRef.current = undefined; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    (map.getSource("civic-work-geometry") as GeoJSONSource | undefined)?.setData(collections.geometries);
    (map.getSource("civic-work-anchor") as GeoJSONSource | undefined)?.setData(collections.anchors);
  }, [collections, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    fitToWorks(map, works);
    setMapMoved(false);
  }, [mapReady, works]);

  const searchBounds = () => {
    const current = mapRef.current?.getBounds();
    if (!current) return;
    onBoundsChange({ minLongitude: current.getWest(), minLatitude: current.getSouth(), maxLongitude: current.getEast(), maxLatitude: current.getNorth() });
    setMapMoved(false);
  };

  return <div className="work-map-shell">
    <div aria-label="Map legend" className="work-map-legend"><span data-period="past">Past</span><span data-period="current">Happening now</span><span data-period="future">Upcoming</span></div>
    {mapMoved ? <button className="work-map-search" onClick={searchBounds} type="button">Search this map region</button> : null}
    <div aria-label="Map of civic works" className="work-map" ref={containerRef} role="application" />
    {mapError ? <p className="work-map-warning">The basemap could not be fully loaded. Work geometry remains available in the timeline.</p> : null}
  </div>;
}
