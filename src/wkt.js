import WKT from "ol/format/WKT";
import GeoJSON from "ol/format/GeoJSON";
import epsgList from "./epsg";
import crsList from "./crs";
import { Geometry } from "@pieterprovoost/wkx";
import { Buffer } from "buffer";
import { cellToBoundary } from "h3-js";
import geohash from "ngeohash";

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

  const regexPostgis = new RegExp("SRID=[0-9]+;\\s*(.*)");

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
    json: null,
    wkb: null,
    ewkb: null
  }

  // handle H3 and geohash

  if (input.wkt && (input.wkt.length === 15 || input.wkt.length === 16) && input.wkt.match(/^[0-9a-f]+$/i)) {
    const boundary = cellToBoundary(input.wkt, true);
    const wkt = "POLYGON ((" + boundary.map(x => x[0] + " " + x[1]).join(",") + "))";
    input.wkt = wkt;
    input.epsg = 4326;
  } else if (input.wkt && input.wkt.match(/^[0-9a-z]+$/)) {
    const [bottom, left, top, right] = geohash.decode_bbox(input.wkt);
    const wkt = "POLYGON((" +
      left + " " + top + ", " +
      right + " " + top + ", " +
      right + " " + bottom + ", " +
      left + " " + bottom + ", " +
      left + " " + top +
      "))";
    input.wkt = wkt;
    input.epsg = 4326;
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
      
      // TODO: move
      const uint8 = Geometry.parse(wktPart).toWkb();
      const hex = Buffer.from(uint8).toString("hex").toUpperCase();
      input.wkb = hex;

      const uint8Ewkb = Geometry.parse("SRID=" + input.epsg + ";" + wktPart).toEwkb();
      const hexEwkb = Buffer.from(uint8Ewkb).toString("hex").toUpperCase();
      input.ewkb = hexEwkb;

    } catch (e) {
      console.error(e);
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
