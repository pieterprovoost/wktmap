import "bootstrap/dist/css/bootstrap.min.css";
import { Navbar, Container, Button, Form, Row, Col, Alert, InputGroup, Toast, ToastContainer } from "react-bootstrap";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { React, useState, useMemo, useEffect, useRef } from "react";
import epsgList from "./epsg";
import crsList from "./crs";
import examples from "./examples";
import proj4 from "proj4";
import WKT from "ol/format/WKT";
import GeoJSON from "ol/format/GeoJSON";
import { Twitter } from "react-bootstrap-icons";
import FullscreenControl from "./FullscreenControl";
import CRC32 from "crc-32";

const DEFAULT_EPSG = "4326";
const USE_WKT = false;

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
  const [exampleIndex, setExampleIndex] = useState(0);
  const [showUrl, setShowUrl] = useState(false);

  const groupRef = useRef();
  const epsgCache = useRef(epsgList);

  const displayMap = useMemo(
    () => (
      <MapContainer
        id="map"
        center={[10, 0]}
        zoom={1}
        scrollWheelZoom={true}
        ref={setMap}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FullscreenControl />
      </MapContainer>
    ), []
  );

  useEffect(() => {
    async function fetchWkt() {
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
    let hash = window.location.pathname.replace("/", "");
    if (hash.length > 0) {
      fetchWkt();
    } else {
      loadExample();
    }
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProj(inputEpsg) {
    let proj;
    if (inputEpsg in epsgCache.current) {
      proj = epsgCache.current[inputEpsg];
    } else {
      try {
        const res = await fetch("https://epsg.io/" + inputEpsg + (USE_WKT ? ".wkt" : ".proj4"));
        if (res.status === 200) {
          const text = await res.text();
          if (text.includes(USE_WKT ? "PROJCS" : "+proj")) {
            proj = text;
            epsgCache.current[inputEpsg] = proj;
          }
        }
      } catch (error) {
      }
    }
    return proj;
  }
  
  function handleWktClear() {
    setWkt("");
    processInput({
      epsg: epsg,
      wkt: ""
    });
  }

  function handleWktChange(e) {
    setWkt(e.target.value);
    processInput({
      wkt: e.target.value,
      epsg: epsg
    });
  }

  function handleEpsgChange(e) {
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
    window.history.replaceState(null, null, hash);
    setShowUrl(true);
  }

  function loadExample() {
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

  function parseWkt(wkt) {
    const wktFormat = new WKT();
    const feature = wktFormat.readFeature(wkt);
    const geojsonFormat = new GeoJSON({});
    const json = geojsonFormat.writeFeatureObject(feature);
    return json;
  }

  async function processInput(input) {

    setError(null);
    input = {
      ...input,
      proj: null,
      json: null
    }

    // split input

    const [, crsPart, wktPart] = input.wkt.match(/(<.*>)?\s*(.*)/);
    
    // parse EPSG if in WKT

    let parsedEpsg;
    
    if (crsPart) {
      const cleanCrsPart = crsPart.trim().replace(/^<|>$/g, "").replace("https://", "http://");
      const matches = crsPart.match(/opengis.net\/def\/crs\/EPSG\/[0-9.]+\/([0-9]+)(?:>)/);
      if (cleanCrsPart in crsList) {
        parsedEpsg = crsList[cleanCrsPart];
      } else if (matches) {
        parsedEpsg = matches[1];
      } else {
        setError("CRS URI not supported (only OpenGIS EPSG for now)");
      }
    }
    
    if (parsedEpsg) {
      input = {
        ...input,
        epsg: parsedEpsg
      };
      setEpsg(parsedEpsg);
    }

    // get proj

    input.proj = await fetchProj(input.epsg);
    if (!input.proj) {
      setError("EPSG not found");
    }

    // parse WKT
    
    if (input.proj && wktPart !== "") {
      try {
        input.json = parseWkt(wktPart);
      } catch (e) {
        let matches;
        let error = "WKT parsing failed";
        matches = e.message.match(/(Unexpected .* at position.*)(?:\sin.*)/);
        if (matches) {
          error = "WKT parsing failed: " + matches[1];
        }
        matches = e.message.match(/(Invalid geometry type.*)/);
        if (matches) {
          error = "WKT parsing failed: " + matches[1];
        }
        setError(error);
      }
    }

    // update

    visualize(input);

  }

  async function visualize(spatial) {
    if (map) {
      if (!groupRef.current) {
        const layerGroup = new L.LayerGroup();
        groupRef.current = layerGroup;
        layerGroup.addTo(map);
      }
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
        map.flyToBounds(newLayer.getBounds(), { duration: 0.5, maxZoom: 14 });
      }
    }
  }

  return (
    <div id="app">

      <ToastContainer className="p-3" position="top-end">
        <Toast onClose={() => setShowUrl(false)} show={showUrl} delay={3000} autohide className="">
          <Toast.Body>Generated URL for sharing</Toast.Body>
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
            <Button variant="light" onClick={loadExample}>Load example</Button>
            <Button className="mx-2" variant="warning" onClick={handleWktClear}>Clear</Button>
            <Button variant="success" onClick={handleShare}>Share</Button>
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
      <p className="text-muted">This page parses and visualizes <a href="https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry" rel="noreferrer" className="text-muted" target="_blank">WKT</a> (ISO 13249) as well as <a href="https://opengeospatial.github.io/ogc-geosparql/geosparql11/spec.html#_rdfs_datatype_geowktliteral" target="blank" rel="noreferrer" className="text-muted">geo:wktLiteral</a> strings in a variety of coordinate reference systems. Built with <a href="https://openlayers.org/" target="blank" rel="noreferrer" className="text-muted">OpenLayers</a>, <a href="https://leafletjs.com/" target="blank" rel="noreferrer" className="text-muted">Leaflet</a>, <a href="https://trac.osgeo.org/proj4js" target="blank" rel="noreferrer" className="text-muted">Proj4js</a>, and <a href="https://epsg.io/" target="blank" rel="noreferrer" className="text-muted">epsg.io</a>.</p>
      <p className="text-muted">Created by <Twitter className="mb-1"/> <a rel="noreferrer" className="text-muted" href="https://twitter.com/PieterPrvst" target="_blank">PieterPrvst</a></p>
      </Container>
    </footer>

    </div>
  );
}

export default App;
