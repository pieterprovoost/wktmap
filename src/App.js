import "bootstrap/dist/css/bootstrap.min.css";
import { Navbar, Container, Button, Form, Row, Col, Alert, InputGroup, Toast, ToastContainer, Dropdown } from "react-bootstrap";
import { MapContainer, TileLayer, FeatureGroup, LayersControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { React, useState, useMemo, useEffect, useRef } from "react";
import examples from "./examples";
import proj4 from "proj4";
import { Twitter } from "react-bootstrap-icons";
import FullscreenControl from "./FullscreenControl";
import CRC32 from "crc-32";
import { EditControl } from "react-leaflet-draw";
import { geojsonToWKT } from "@terraformer/wkt";
import ReactGA from "react-ga4";
import { transformInput, ValueError } from "./wkt";

const DEFAULT_EPSG = "4326";

function createCircleMarker(feature, latlng) {
  let options = {
    radius: 4
  }
  return L.circleMarker(latlng, options);
}

function App() {

  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [epsg, setEpsg] = useState("");
  const [wkt, setWkt] = useState("");
  const [wkb, setWkb] = useState("");
  const [ewkb, setEwkb] = useState("");
  const [json, setJson] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [showUrl, setShowUrl] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  const groupRef = useRef();

  const displayMap = useMemo(
    () => (
      <MapContainer
        id="map"
        center={[10, 0]}
        zoom={1}
        scrollWheelZoom={true}
        ref={setMap}>
        <LayersControl>
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Humanitarian">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
              url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Esri World Imagery">
            <TileLayer
              attribution='Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay name="OpenSeaMap">
            <TileLayer
              attribution='&copy; <a href="http://www.openseamap.org">OpenSeaMap contributors</a>'
              url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            />
          </LayersControl.Overlay>
        </LayersControl>
        <FullscreenControl />
        <FeatureGroup ref={groupRef}>
          <EditControl
            position="topright"
            onDrawStop={handleDrawStop}
            edit={{edit: false, remove: false}}
            draw={{
              rectangle: {
                shapeOptions: {
                    opacity: 1,
                    fillOpacity: 0.2,
                    weight: 3,
                    color: "#3388ff",
                    fill: "#3388ff"
                }
              },
              marker: false,
              circle: false,
              polygon: {
                shapeOptions: {
                    opacity: 1,
                    fillOpacity: 0.2,
                    weight: 3,
                    color: "#3388ff",
                    fill: "#3388ff"
                }
              },
              circlemarker: {
                  opacity: 1,
                  fillOpacity: 0.2,
                  weight: 3,
                  radius: 4,
                  color: "#3388ff",
                  fill: "#3388ff"
              },
              polyline: {
                shapeOptions: {
                    opacity: 1,
                    weight: 3,
                    color: "#3388ff",
                    fill: false
                }
              }
            }}
          />
        </FeatureGroup>
      </MapContainer>
    ), [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    async function fetchWkt(hash) {
      const res = await fetch("https://xpjpbiqaa3.execute-api.us-east-1.amazonaws.com/prod/wkt/" + hash);
      if (res.status === 200) {
        const data = await res.json();
        let paramWkt = data.wkt ? data.wkt : "";
        let paramEpsg = data.epsg ? data.epsg : DEFAULT_EPSG;
        setWkt(paramWkt);
        setEpsg(paramEpsg);
        processInput({
          wkt: paramWkt,
          epsg: paramEpsg
        });
      }
    }
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (Object.keys(params).length === 0) {
      loadExample();
    } else {
      const hash = Object.keys(params)[0];
      fetchWkt(hash);
    }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  
  function splitGeometry(geometry) {
    if (geometry.type === "GeometryCollection") { 
      return geometry.geometries;
    } else {
      return [geometry];
    }
  }

  function handleDrawStop() {
    let geometries = [];
    groupRef.current.eachLayer(function(layer) {
      const geo = layer.toGeoJSON();
      if (geo.type === "Feature") {
        geometries = geometries.concat(splitGeometry(geo.geometry));
      } else if (geo.type === "FeatureCollection") {
        geo.features.forEach(feature => {
          geometries = geometries.concat(splitGeometry(feature.geometry));
        });
      }
    });
    const wktGeometries = geometries.map(geojsonToWKT);
    let wkt;
    if (wktGeometries.length === 1) {
      wkt = wktGeometries[0];
    } else if (wktGeometries.length > 1) {
      wkt = "GEOMETRYCOLLECTION(" + wktGeometries.join(", ") + ")";
    }
    setEpsg(4326);
    clearHash();
    if (wkt) {
      setWkt(wkt);
      processInput({
        epsg: 4326,
        wkt: wkt
      }, false);
    }
  }

  function handleCopy(format) {
    if (!error) {
      let text = "";
      if (format === "wkt") {
        text = wkt;
      } else if (format === "wkb") {
        text = wkb;
      } else if (format === "ewkb") {
        text = ewkb;
      } else if (format === "geojson") {
        text = json;
      }
      navigator.clipboard.writeText(text);
      setShowCopied(true);
    }
  }

  function handleWktClear() {
    clearHash();
    setWkt("");
    processInput({
      epsg: epsg,
      wkt: ""
    });
  }

  function handleWktChange(e) {
    clearHash();
    setWkt(e.target.value);
    processInput({
      wkt: e.target.value,
      epsg: epsg
    });
  }

  function handleEpsgChange(e) {
    clearHash();
    setEpsg(e.target.value);
    processInput({
      wkt: wkt,
      epsg: e.target.value
    });
  }

  function handleShare() {
    let crc = CRC32.str(wkt + epsg);
    let hash = (crc >>> 0).toString(16).padStart(8, "0");
    fetch("https://xpjpbiqaa3.execute-api.us-east-1.amazonaws.com/prod/wkt", {
      method: "POST",
      body: JSON.stringify({
        id: hash,
        wkt: wkt,
        epsg: epsg
      }),
      headers: {
        "Content-Type": "application/json"
      }
    }).catch(error => console.error(error)); 
    window.history.replaceState(null, null, "?" + hash);
    setShowUrl(true);
    ReactGA.event({
      category: "wkt",
      action: "wkt_share",
      label: hash,
    });
  }

  function loadExample() {
    clearHash();
    const example = examples[exampleIndex];
    setWkt(example[0]);
    setEpsg(example[1]);
    processInput({
      wkt: example[0],
      epsg: example[1]
    });
    const newIndex = exampleIndex < examples.length - 1 ? exampleIndex + 1 : 0;
    setExampleIndex(newIndex);
  }

  async function processInput(input, doVisualize = true) {
    setError(null);
    try {
      input = await transformInput(input);
    } catch (error) {
      if (error instanceof ValueError) {
        setError(error.message);
      }
    }
    setWkt(input.wkt);
    setEpsg(input.epsg);
    setWkb(input.wkb);
    setEwkb(input.ewkb);
    setJson(input.json ? JSON.stringify(input.json, null, 2) : null);
    if (doVisualize) {
      visualize(input);
    }
  }

  function clearHash() {
    const url = new URL(window.location);
    url.search = "";
    window.history.replaceState(null, null, url);
  }

  async function visualize(spatial) {
    groupRef.current.clearLayers();
    if (spatial.json) {
      const conf = {
        pointToLayer: createCircleMarker,
      };
      if (spatial.proj) {
        conf.coordsToLatLng = function(coords) {
          const newCoords = proj4(spatial.proj, "EPSG:" + DEFAULT_EPSG, [coords[0], coords[1]]);
          return new L.LatLng(newCoords[1], newCoords[0]);
        }
      }
      let newLayer = L.geoJSON(spatial.json, conf).addTo(groupRef.current);
      if (map) map.flyToBounds(newLayer.getBounds(), { duration: 0.5, maxZoom: 14 });
    }
  }

  return (
    <div id="app">

      <ToastContainer className="p-3" position="top-end">
      <Toast onClose={() => setShowUrl(false)} show={showUrl} delay={5000} autohide className="">
          <Toast.Body>Generated URL for sharing</Toast.Body>
        </Toast>
        <Toast onClose={() => setShowCopied(false)} show={showCopied} delay={5000} autohide className="">
          <Toast.Body>Copied geometry</Toast.Body>
        </Toast>
      </ToastContainer>

      <Navbar bg="light" expand="lg">
        <Container>
          <Navbar.Brand href="/">
            Well-known Text (WKT) visualization
          </Navbar.Brand>
        </Container>
      </Navbar>

      { displayMap }

      <Container className="mt-3 mb-3">

        <Row>
          <Col lg={true} className="mb-3">
            <Form.Group className="mb-3" controlId="wkt">
              <Form.Label>WKT</Form.Label>
              <Form.Control className="font-monospace" as="textarea" rows={8} value={wkt} onChange={handleWktChange} />
            </Form.Group>
            <div className="d-flex d-md-block justify-content-between">
              <Button className="me-2" variant="light" onClick={loadExample}>Load example</Button>
              <Button className="me-2" variant="warning" onClick={handleWktClear}>Clear</Button>
              <Dropdown className="me-2 d-inline-block">
                <Dropdown.Toggle variant="light">Copy as</Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item disabled={error || !json} onClick={() => handleCopy("wkt")}>WKT</Dropdown.Item>
                  <Dropdown.Item disabled={error || !wkb} onClick={() => handleCopy("wkb")}>WKB</Dropdown.Item>
                  <Dropdown.Item disabled={error || !ewkb} onClick={() => handleCopy("ewkb")}>EWKB</Dropdown.Item>
                  {/* <Dropdown.Item disabled={error || !json} onClick={() => handleCopy("geojson")}>GeoJSON</Dropdown.Item> */}
                </Dropdown.Menu>
              </Dropdown>
              <Button className="me-2" variant="success" onClick={handleShare}>Share</Button>
            </div>
          </Col>
          <Col lg={true} className="mb-3">
            <Form.Group className="mb-3" controlId="epsg">
              <Form.Label>EPSG</Form.Label>
              <InputGroup>
                <InputGroup.Text id="basic-addon1">EPSG:</InputGroup.Text>
                <Form.Control value={epsg} onChange={handleEpsgChange} />
              </InputGroup>
            </Form.Group>
            {
              error && <Alert variant="danger">{error}</Alert>
            }
          </Col>
        </Row>
      </Container>

      <footer className="footer mt-auto pt-5 pb-4 bg-light">
        <Container>
          <p className="text-muted">This page parses, visualizes, and shares <a href="https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry" rel="noreferrer" className="text-muted" target="_blank">WKT</a> (ISO 13249) as well as <a href="https://opengeospatial.github.io/ogc-geosparql/geosparql11/spec.html#_rdfs_datatype_geowktliteral" target="blank" rel="noreferrer" className="text-muted">geo:wktLiteral</a> strings in a variety of coordinate reference systems. Built with <a href="https://openlayers.org/" target="blank" rel="noreferrer" className="text-muted">OpenLayers</a>, <a href="https://leafletjs.com/" target="blank" rel="noreferrer" className="text-muted">Leaflet</a>, <a href="https://trac.osgeo.org/proj4js" target="blank" rel="noreferrer" className="text-muted">Proj4js</a>, <a href="https://github.com/terraformer-js/terraformer" target="blank" rel="noreferrer" className="text-muted">terraformer</a>, and <a href="https://epsg.io/" target="blank" rel="noreferrer" className="text-muted">epsg.io</a>. Use the drawing tools to create your own geometries. Copy as Well-known Binary (WKB) or Extended Well-known Binary (EWKB). Also supports the conversion of H3 indices to WKT.</p>
          <p className="text-muted">Created by <Twitter className="mb-1"/> <a rel="noreferrer" className="text-muted" href="https://twitter.com/PieterPrvst" target="_blank">PieterPrvst</a></p>
        </Container>
      </footer>

    </div>
  );
}

export default App;
