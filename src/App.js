import "bootstrap/dist/css/bootstrap.min.css";
import { Navbar, Container, Button, Form, Row, Col, Alert, InputGroup } from "react-bootstrap";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { React, useState, useMemo, useEffect, useRef } from "react";
import epsgs from "./epsg";
import examples from "./examples";
import proj4 from "proj4";
import WKT from "ol/format/WKT";
import GeoJSON from "ol/format/GeoJSON";
import { Twitter } from "react-bootstrap-icons";
import { CRSNotSupportedError } from "./errors";

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
  const [wkt, setWkt] = useState(examples[0][0]);
  const [epsg, setEpsg] = useState(examples[0][1]);
  const [valid, setValid] = useState(null);

  const groupRef = useRef();
  const epsgCache = useRef(epsgs);

  const displayMap = useMemo(
    () => (
      <MapContainer
        id="map"
        center={[10, 0]}
        zoom={1}
        scrollWheelZoom={false}
        ref={setMap}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    ), []
  )

  async function fetchProj(crs) {
    let proj;
    if (crs in epsgCache.current) {
      proj = epsgCache.current[crs];
    } else {
      try {
        const res = await fetch("https://epsg.io/" + crs + ".proj4");
        const text = await res.text();
        if (!text.includes("+proj")) {
          throw new Error("Request did not return a proj string");
        }
        proj = text;
        epsgCache.current[crs] = proj;
      } catch (e) {
        console.error(e);
      }
    }
    return proj;
  }
  
  function handleEpsgClear() {
    setEpsg(DEFAULT_EPSG);
  }

  async function handleEpsgValidate() {
    const proj = await fetchProj(epsg);
    if (proj) {
      setValid(proj);
    } else {
      setValid(false);
    }
  }

  function handleWktChange(e) {
    setWkt(e.target.value);
  }

  function handleEpsgChange(e) {
    setEpsg(e.target.value);
  }

  function handleLoadExample() {
    const example = examples[Math.floor(Math.random() * examples.length)];
    setWkt(example[0]);
    setEpsg(example[1]);
  }

  function clearLayerGroup() {
    if (!groupRef.current && map) {
      const layerGroup = new L.LayerGroup();
      groupRef.current = layerGroup;
      layerGroup.addTo(map);
    }
    groupRef.current.clearLayers();
  }

  function parseWkt() {
    if (wkt) {
      const [, crsPart, wktPart] = wkt.match(/(<.*>)?\s*(.*)/);
      let crs;
      if (crsPart) {
        const matches = crsPart.match(/opengis.net\/def\/crs\/EPSG\/[0-9.]+\/([0-9]+)(?:>)/);
        if (matches) {
          crs = matches[1];
          setEpsg(crs);
        } else {
          throw new CRSNotSupportedError();
        }
      }
      const wktFormat = new WKT();
      const feature = wktFormat.readFeature(wktPart);
      const geojsonFormat = new GeoJSON({});
      const json = geojsonFormat.writeFeatureObject(feature);
      return [json, crs];
    }
  }

  async function handleVisualize() {
    setError(null);
    clearLayerGroup();
    let json;
    let crs;
    try {
      [json, crs] = parseWkt();
    } catch (e) {
      if (e instanceof CRSNotSupportedError) {
        setError("CRS URI not supported (only OpenGIS EPSG for now)");
      } else {
        console.error(e);
        setError("WKT parsing failed");
      }
      return;
    }
    const conf = {
      pointToLayer: createCircleMarker,
    };
    // use EPSG unless CRS provided by parser
    if (!crs) {
      crs = epsg;
    }
    if (crs !== DEFAULT_EPSG) {
      const proj = await fetchProj(crs);
      if (proj) {
        conf.coordsToLatLng = function(coords) {
          const newCoords = proj4(proj, "EPSG:" + DEFAULT_EPSG, [coords[0], coords[1]]);
          return new L.LatLng(newCoords[1], newCoords[0]);
        }
      } else {
        setError("EPSG not found");
      }
    }
    let newLayer = L.geoJSON(json, conf).addTo(groupRef.current);
    map.flyToBounds(newLayer.getBounds(), { duration: 0.5 });
  }

  useEffect(() => {
    setValid(null);
  }, [ epsg ]);

  return (
    <div id="app">
      <Navbar bg="light" expand="lg">
        <Container>
          <Navbar.Brand href="/">
            Well-known Text (WKT) visualization
          </Navbar.Brand>
        </Container>
      </Navbar>

      { displayMap }

      <Container className="mt-3 mb-3">

        {
          error && <Alert variant="danger">{error}</Alert>
        }

        <Row>
          <Col lg={true} className="mb-3">
            <Form.Group className="mb-3" controlId="wkt">
              <Form.Label>WKT</Form.Label>
              <Form.Control className="font-monospace" as="textarea" rows={8} value={wkt} onChange={handleWktChange} />
            </Form.Group>
            <Button variant="light" onClick={handleLoadExample}>Load example</Button>
          </Col>
          <Col lg={true} className="mb-3">
            <Form.Group className="mb-3" controlId="epsg">
              <Form.Label>EPSG</Form.Label>
              <InputGroup>
                <InputGroup.Text id="basic-addon1">EPSG:</InputGroup.Text>
                <Form.Control value={epsg} onChange={handleEpsgChange} />
                <Button variant="warning" onClick={handleEpsgClear}>Reset</Button>
                <Button variant="light" onClick={handleEpsgValidate}>Validate</Button>
              </InputGroup>
            </Form.Group>

            {
              valid === false && <Alert variant="danger">EPSG not found</Alert>
            }
            {
              valid && <Alert variant="success">Valid EPSG<br/><code>{valid}</code></Alert>
            }

            <Button variant="primary" onClick={handleVisualize}>Visualize</Button>
          </Col>
        </Row>
      </Container>

    <footer className="footer mt-auto pt-5 pb-4 bg-light">
      <Container>
      <p className="text-muted">This page parses and visualizes <a href="https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry" rel="noreferrer" className="text-muted" target="_blank">WKT</a> (ISO 13249) as well as <a href="https://opengeospatial.github.io/ogc-geosparql/geosparql11/spec.html#_rdfs_datatype_geowktliteral" target="blank" rel="noreferrer" className="text-muted">geo:wktLiteral</a> strings in a variety of coordinate reference systems.</p>
      <p className="text-muted">Created by <Twitter className="mb-1"/> <a rel="noreferrer" className="text-muted" href="https://twitter.com/PieterPrvst" target="_blank">PieterPrvst</a></p>
      </Container>
    </footer>

    </div>
  );
}

export default App;
