import WKT from "ol/format/WKT";
import GeoJSON from "ol/format/GeoJSON";
import epsgList from "./epsg";
import crsList from "./crs";

const USE_WKT = false;

class ValueError extends Error {
  constructor(message) {
      super(message);
      this.name = "ValueError";
  }
}

function parseWkt(wkt) {
  const wktFormat = new WKT();
  const feature = wktFormat.readFeature(wkt);
  const geojsonFormat = new GeoJSON({});
  const json = geojsonFormat.writeFeatureObject(feature);
  return json;
}

async function fetchProj(inputEpsg) {
  let proj;
  if (inputEpsg in epsgList) {
    proj = epsgList[inputEpsg];
  } else {
    try {
      const res = await fetch("https://epsg.io/" + inputEpsg + (USE_WKT ? ".wkt" : ".proj4"));
      if (res.status === 200) {
        const text = await res.text();
        if (text.includes(USE_WKT ? "PROJCS" : "+proj")) {
          proj = text;
          epsgList[inputEpsg] = proj;
        }
      }
    } catch (error) {
    }
  }
  return proj;
}

function extractAndParseCrs(input) {

  const regexLiteral = new RegExp("<.*>\s*(.*)");
  const regexPostgis = new RegExp("SRID=[0-9]+;\s*(.*)");

  let crsPart, wktPart, parsedEpsg;

  if (regexPostgis.test(input.wkt)) {
    [, crsPart, wktPart] = input.wkt.match(/(SRID=[0-9]+);\s*(.*)/);
    parsedEpsg = crsPart.match(/(\d+)/)[0];
  } else {
    [, crsPart, wktPart] = input.wkt.match(/(<.*>)?\s*(.*)/);
    if (crsPart) {
      const cleanCrsPart = crsPart.trim().replace(/^<|>$/g, "").replace("https://", "http://");
      const matches = crsPart.match(/opengis.net\/def\/crs\/EPSG\/[0-9.]+\/([0-9]+)(?:>)/);
      if (cleanCrsPart in crsList) {
        parsedEpsg = crsList[cleanCrsPart];
      } else if (matches) {
        parsedEpsg = matches[1];
      } else {
        throw ValueError("CRS URI not supported (only OpenGIS EPSG for now)");
      }
    }
  }

  return {
    crsPart: crsPart,
    wktPart: wktPart,
    parsedEpsg: parsedEpsg
  }
}

async function transformInput(input) {
  input = {
    ...input,
    proj: null,
    json: null
  }

  // split input, parse EPSG if in WKT

  const { wktPart, parsedEpsg } = extractAndParseCrs(input);
    
  if (parsedEpsg) {
    input = {
      ...input,
      epsg: parsedEpsg
    };
  }

  // get proj

  input.proj = await fetchProj(input.epsg);
  if (!input.proj) {
    throw ValueError("EPSG not found");
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
      throw new ValueError(error);
    }
  }

  return input;

}

export { parseWkt, transformInput, ValueError, fetchProj, extractAndParseCrs };
