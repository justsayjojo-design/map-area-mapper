import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/helpers';
import { area } from '@turf/area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState('');
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState<number[][]>([]);
  const [savedPolygons, setSavedPolygons] = useState<Polygon[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showSavedPolygons, setShowSavedPolygons] = useState(true);

  // Initialize map once token is provided
  useEffect(() => {
    if (!mapContainer.current || !isTokenValid) return;

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [78.9629, 20.5937], // Center of India
      zoom: 5,
      pitch: 0,
      bearing: 0,
    });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Handle map clicks for polygon drawing
    map.current.on('click', handleMapClick);

    // Load saved polygons from localStorage
    loadSavedPolygons();

    return () => {
      map.current?.remove();
    };
  }, [isTokenValid, mapboxToken]);

  const validateToken = (token: string) => {
    if (token.startsWith('pk.') && token.length > 50) {
      setIsTokenValid(true);
      toast.success('Mapbox token validated successfully!');
    } else {
      toast.error('Invalid Mapbox token. Please check and try again.');
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateToken(mapboxToken);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.current?.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 2000,
        });
        
        // Add a marker for current location
        new mapboxgl.Marker({ color: '#0ea5e9' })
          .setLngLat([longitude, latitude])
          .addTo(map.current!);
        
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

  const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
    if (!isDrawing) return;

    const { lng, lat } = e.lngLat;
    const newPoint = [lng, lat];
    const updatedPolygon = [...currentPolygon, newPoint];
    
    setCurrentPolygon(updatedPolygon);

    // Add marker for the point
    new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat([lng, lat])
      .addTo(map.current!);

    // If we have at least 3 points, draw the polygon
    if (updatedPolygon.length >= 3) {
      drawCurrentPolygon(updatedPolygon);
    }

    toast.success(`Point ${updatedPolygon.length} added`);
  };

  const drawCurrentPolygon = (coordinates: number[][]) => {
    if (!map.current || coordinates.length < 3) return;

    // Close the polygon by adding the first point at the end
    const closedCoordinates = [...coordinates, coordinates[0]];

    // Remove existing current polygon
    if (map.current.getSource('current-polygon')) {
      map.current.removeLayer('current-polygon-fill');
      map.current.removeLayer('current-polygon-line');
      map.current.removeSource('current-polygon');
    }

    // Add polygon source and layers
    map.current.addSource('current-polygon', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedCoordinates],
        },
        properties: {},
      },
    });

    map.current.addLayer({
      id: 'current-polygon-fill',
      type: 'fill',
      source: 'current-polygon',
      paint: {
        'fill-color': '#0ea5e9',
        'fill-opacity': 0.3,
      },
    });

    map.current.addLayer({
      id: 'current-polygon-line',
      type: 'line',
      source: 'current-polygon',
      paint: {
        'line-color': '#0ea5e9',
        'line-width': 2,
      },
    });
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

    const closedCoordinates = [...polygon.coordinates, polygon.coordinates[0]];
    const sourceId = `polygon-${polygon.id}`;

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [closedCoordinates],
        },
        properties: { id: polygon.id, name: polygon.name },
      },
    });

    map.current.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#10b981',
        'fill-opacity': 0.2,
      },
    });

    map.current.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#10b981',
        'line-width': 2,
      },
    });
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
    setCurrentPolygon([]);
    setIsDrawing(false);

    // Remove current polygon from map
    if (map.current?.getSource('current-polygon')) {
      map.current.removeLayer('current-polygon-fill');
      map.current.removeLayer('current-polygon-line');
      map.current.removeSource('current-polygon');
    }

    // Clear all red markers (drawing points)
    document.querySelectorAll('.mapboxgl-marker').forEach(marker => {
      const markerElement = marker as HTMLElement;
      if (markerElement.style.backgroundColor === 'rgb(239, 68, 68)') {
        marker.remove();
      }
    });
  };

  const deleteSavedPolygon = (polygonId: string) => {
    const updatedPolygons = savedPolygons.filter(p => p.id !== polygonId);
    setSavedPolygons(updatedPolygons);
    localStorage.setItem('savedPolygons', JSON.stringify(updatedPolygons));

    // Remove from map
    const sourceId = `polygon-${polygonId}`;
    if (map.current?.getSource(sourceId)) {
      map.current.removeLayer(`${sourceId}-fill`);
      map.current.removeLayer(`${sourceId}-line`);
      map.current.removeSource(sourceId);
    }

    toast.success('Polygon deleted');
  };

  const toggleSavedPolygonsVisibility = () => {
    setShowSavedPolygons(!showSavedPolygons);
    
    savedPolygons.forEach(polygon => {
      const sourceId = `polygon-${polygon.id}`;
      if (map.current?.getLayer(`${sourceId}-fill`)) {
        map.current.setLayoutProperty(
          `${sourceId}-fill`,
          'visibility',
          showSavedPolygons ? 'none' : 'visible'
        );
        map.current.setLayoutProperty(
          `${sourceId}-line`,
          'visibility',
          showSavedPolygons ? 'none' : 'visible'
        );
      }
    });
  };

  // Token input screen
  if (!isTokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-6 glass">
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Satellite Mapper</h1>
              <p className="text-muted-foreground mt-2">
                Enter your Mapbox public token to get started
              </p>
            </div>
            
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6..."
                  value={mapboxToken}
                  onChange={(e) => setMapboxToken(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Get your token from{' '}
                  <a
                    href="https://mapbox.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    mapbox.com
                  </a>
                </p>
              </div>
              
              <Button type="submit" className="w-full">
                Initialize Map
              </Button>
            </form>
          </div>
        </Card>
      </div>
    );
  }

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
    </div>
  );
};

export default SatelliteMap;