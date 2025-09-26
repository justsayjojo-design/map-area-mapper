import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/helpers';
import { area } from '@turf/area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Navigation, MapPin, Trash2, Save, Eye, EyeOff } from 'lucide-react';

interface Polygon {
  id: string;
  coordinates: number[][];
  area: {
    sqMeters: number;
    hectares: number;
  };
  name: string;
  created: Date;
}

const SatelliteMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [currentPolygon, setCurrentPolygon] = useState<number[][]>([]);
  const [savedPolygons, setSavedPolygons] = useState<Polygon[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showSavedPolygons, setShowSavedPolygons] = useState(true);
  const [currentPolygonLayer, setCurrentPolygonLayer] = useState<L.Polygon | null>(null);
  const [currentMarkers, setCurrentMarkers] = useState<L.Marker[]>([]);
  const [savedPolygonLayers, setSavedPolygonLayers] = useState<Map<string, L.Polygon>>(new Map());
  const [currentLocationMarker, setCurrentLocationMarker] = useState<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize Leaflet map
    map.current = L.map(mapContainer.current, {
      center: [20.5937, 78.9629], // Center of India
      zoom: 5,
      zoomControl: false,
    });

    // Add Esri World Imagery tile layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 18,
    }).addTo(map.current);

    // Add zoom controls to top-right
    L.control.zoom({ position: 'topright' }).addTo(map.current);

    // Handle map clicks for polygon drawing
    map.current.on('click', handleMapClick);

    // Load saved polygons from localStorage
    loadSavedPolygons();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (!map.current) return;

        // Fly to location
        map.current.setView([latitude, longitude], 15);
        
        // Remove existing location marker
        if (currentLocationMarker) {
          map.current.removeLayer(currentLocationMarker);
        }

        // Add marker for current location
        const marker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'current-location-marker',
            html: '<div class="w-4 h-4 bg-sky-500 rounded-full border-2 border-white shadow-lg"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(map.current);
        
        setCurrentLocationMarker(marker);
        toast.success('Navigated to your current location!');
      },
      (error) => {
        toast.error('Unable to retrieve your location.');
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (!isDrawing || !map.current) return;

    const { lat, lng } = e.latlng;
    const newPoint = [lng, lat]; // Note: GeoJSON uses [lng, lat] format
    const updatedPolygon = [...currentPolygon, newPoint];
    
    setCurrentPolygon(updatedPolygon);

    // Add marker for the point
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'polygon-point-marker',
        html: '<div class="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    }).addTo(map.current);

    setCurrentMarkers(prev => [...prev, marker]);

    // If we have at least 3 points, draw the polygon
    if (updatedPolygon.length >= 3) {
      drawCurrentPolygon(updatedPolygon);
    }

    toast.success(`Point ${updatedPolygon.length} added`);
  };

  const drawCurrentPolygon = (coordinates: number[][]) => {
    if (!map.current || coordinates.length < 3) return;

    // Remove existing current polygon
    if (currentPolygonLayer) {
      map.current.removeLayer(currentPolygonLayer);
    }

    // Convert coordinates to Leaflet format [lat, lng]
    const leafletCoords = coordinates.map(coord => [coord[1], coord[0]] as [number, number]);

    // Create polygon
    const polygon = L.polygon(leafletCoords, {
      color: '#0ea5e9',
      fillColor: '#0ea5e9',
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(map.current);

    setCurrentPolygonLayer(polygon);
  };

  const calculateArea = (coordinates: number[][]) => {
    if (coordinates.length < 3) return { sqMeters: 0, hectares: 0 };

    const closedCoordinates = [...coordinates, coordinates[0]];
    const polygon = turf.polygon([closedCoordinates]);
    const areaInSqMeters = area(polygon);
    const areaInHectares = areaInSqMeters / 10000;

    return {
      sqMeters: Math.round(areaInSqMeters * 100) / 100,
      hectares: Math.round(areaInHectares * 100) / 100,
    };
  };

  const saveCurrentPolygon = () => {
    if (currentPolygon.length < 3) {
      toast.error('Need at least 3 points to create a polygon');
      return;
    }

    const polygonArea = calculateArea(currentPolygon);
    const newPolygon: Polygon = {
      id: Date.now().toString(),
      coordinates: currentPolygon,
      area: polygonArea,
      name: `Polygon ${savedPolygons.length + 1}`,
      created: new Date(),
    };

    const updatedPolygons = [...savedPolygons, newPolygon];
    setSavedPolygons(updatedPolygons);
    localStorage.setItem('savedPolygons', JSON.stringify(updatedPolygons));

    // Add to map as a saved polygon
    addSavedPolygonToMap(newPolygon);

    // Clear current drawing
    clearCurrentPolygon();
    toast.success(`Polygon saved! Area: ${polygonArea.hectares} hectares`);
  };

  const addSavedPolygonToMap = (polygon: Polygon) => {
    if (!map.current) return;

    // Convert coordinates to Leaflet format [lat, lng]
    const leafletCoords = polygon.coordinates.map(coord => [coord[1], coord[0]] as [number, number]);

    // Create polygon
    const leafletPolygon = L.polygon(leafletCoords, {
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(map.current);

    // Add popup with polygon info
    leafletPolygon.bindPopup(`
      <div class="text-sm">
        <strong>${polygon.name}</strong><br/>
        Area: ${polygon.area.hectares} ha<br/>
        (${polygon.area.sqMeters} m²)
      </div>
    `);

    setSavedPolygonLayers(prev => new Map(prev.set(polygon.id, leafletPolygon)));
  };

  const loadSavedPolygons = () => {
    const saved = localStorage.getItem('savedPolygons');
    if (saved) {
      const polygons = JSON.parse(saved);
      setSavedPolygons(polygons);
      // Add each polygon to the map
      polygons.forEach((polygon: Polygon) => {
        addSavedPolygonToMap(polygon);
      });
    }
  };

  const clearCurrentPolygon = () => {
    if (!map.current) return;

    setCurrentPolygon([]);
    setIsDrawing(false);

    // Remove current polygon from map
    if (currentPolygonLayer) {
      map.current.removeLayer(currentPolygonLayer);
      setCurrentPolygonLayer(null);
    }

    // Clear all markers
    currentMarkers.forEach(marker => {
      map.current?.removeLayer(marker);
    });
    setCurrentMarkers([]);
  };

  const deleteSavedPolygon = (polygonId: string) => {
    const updatedPolygons = savedPolygons.filter(p => p.id !== polygonId);
    setSavedPolygons(updatedPolygons);
    localStorage.setItem('savedPolygons', JSON.stringify(updatedPolygons));

    // Remove from map
    const polygonLayer = savedPolygonLayers.get(polygonId);
    if (polygonLayer && map.current) {
      map.current.removeLayer(polygonLayer);
      setSavedPolygonLayers(prev => {
        const newMap = new Map(prev);
        newMap.delete(polygonId);
        return newMap;
      });
    }

    toast.success('Polygon deleted');
  };

  const toggleSavedPolygonsVisibility = () => {
    if (!map.current) return;

    const newVisibility = !showSavedPolygons;
    setShowSavedPolygons(newVisibility);
    
    savedPolygonLayers.forEach(layer => {
      if (newVisibility) {
        map.current?.addLayer(layer);
      } else {
        map.current?.removeLayer(layer);
      }
    });
  };

  return (
    <div className="relative w-full h-screen">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Control Panel - Top Left */}
      <Card className="absolute top-4 left-4 p-4 glass w-80">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Polygon Mapper</h2>
          
          {/* Navigation Controls */}
          <div className="space-y-2">
            <Button
              onClick={getCurrentLocation}
              variant="outline"
              size="sm"
              className="w-full glass-hover"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Navigate to My Location
            </Button>
          </div>

          {/* Drawing Controls */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={() => setIsDrawing(!isDrawing)}
                variant={isDrawing ? "default" : "outline"}
                size="sm"
                className="flex-1"
              >
                <MapPin className="w-4 h-4 mr-2" />
                {isDrawing ? 'Stop Drawing' : 'Start Drawing'}
              </Button>
              
              {currentPolygon.length > 0 && (
                <Button
                  onClick={clearCurrentPolygon}
                  variant="outline"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            {currentPolygon.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Points: {currentPolygon.length}
                {currentPolygon.length >= 3 && (
                  <>
                    <br />
                    Area: {calculateArea(currentPolygon).hectares} hectares
                    <br />
                    ({calculateArea(currentPolygon).sqMeters} m²)
                  </>
                )}
              </div>
            )}

            {currentPolygon.length >= 3 && (
              <Button
                onClick={saveCurrentPolygon}
                size="sm"
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Polygon
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Saved Polygons Panel - Bottom Left */}
      {savedPolygons.length > 0 && (
        <Card className="absolute bottom-4 left-4 p-4 glass w-80 max-h-64">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Saved Polygons</h3>
              <Button
                onClick={toggleSavedPolygonsVisibility}
                variant="ghost"
                size="sm"
              >
                {showSavedPolygons ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </Button>
            </div>
            
            <div className="space-y-2 custom-scrollbar overflow-y-auto max-h-40">
              {savedPolygons.map((polygon) => (
                <div
                  key={polygon.id}
                  className="flex items-center justify-between p-2 rounded border border-border bg-muted/20"
                >
                  <div className="text-sm">
                    <div className="font-medium">{polygon.name}</div>
                    <div className="text-muted-foreground">
                      {polygon.area.hectares} ha ({polygon.area.sqMeters} m²)
                    </div>
                  </div>
                  <Button
                    onClick={() => deleteSavedPolygon(polygon.id)}
                    variant="ghost"
                    size="sm"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Instructions - Top Right */}
      <Card className="absolute top-4 right-4 p-3 glass max-w-xs">
        <div className="text-sm space-y-1">
          <div className="font-medium text-foreground">Instructions:</div>
          <div className="text-muted-foreground">
            1. Click "Start Drawing" to begin<br />
            2. Click on map to add polygon vertices<br />
            3. Minimum 3 points required<br />
            4. Click "Save Polygon" when complete
          </div>
        </div>
      </Card>

      {/* Custom styles for markers */}
      <style>{`
        .current-location-marker,
        .polygon-point-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default SatelliteMap;