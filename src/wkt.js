import WKT from "ol/format/WKT";
import GeoJSON from "ol/format/GeoJSON";
import epsgList from "./epsg";
import crsList from "./crs";
import { Geometry } from "@pieterprovoost/wkx";
import { Buffer } from "buffer";
import { cellToBoundary } from "h3-js";
import geohash from "ngeohash";
import quadkeytools from "quadkeytools";
import { geojsonToWKT } from "@terraformer/wkt";
import proj4 from "proj4";
import {register} from "ol/proj/proj4";
import toast from "react-hot-toast";

const USE_WKT = false;

class ValueError extends Error {
  constructor(message) {
      super(message);
      this.name = "ValueError";
  }
}

function parseWkt(wkt, input) {
  proj4.defs("EPSG:" + input.epsg, input.proj);
  register(proj4);
  const options = {"dataProjection": "EPSG:" + input.epsg, "featureProjection": "EPSG:" + input.epsg};
  const wktFormat = new WKT();
  const feature = wktFormat.readFeature(wkt, options);
  feature.getGeometry().transform("EPSG:" + input.epsg, "EPSG:4326");
  const geojsonFormat = new GeoJSON();
  const json = geojsonFormat.writeFeatureObject(feature, options);
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

function extractCoordinates(wkt) {
  const regex = /(-?\d+(\.\d+)?\s+-?\d+(\.\d+)?)/g;
  const matches = wkt.match(regex);
  const coordinates = matches.map(match => {
      const [x, y] = match.split(/\s+/).map(Number);
      return [x, y];
  });
  return coordinates;
}

function getBbox(wkt) {
  const coordinates = extractCoordinates(wkt);
  const xs = coordinates.map(coordinate => coordinate[0]);
  const ys = coordinates.map(coordinate => coordinate[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  return [left, bottom, right, top].join(",");
}

function isH3(input) {
  return input.wkt && (input.wkt.length === 15 || input.wkt.length === 16) && input.wkt.match(/^[0-9a-f]+$/i);
}

function isQuadkey(input) {
  return input.wkt && input.wkt.match(/^[0-3]+$/);
}

function isBbox(input) {
  return input.wkt && input.wkt.match(/^(-?\d+(\.\d+)?),\s?(-?\d+(\.\d+)?),\s?(-?\d+(\.\d+)?),\s?(-?\d+(\.\d+)?)$/);
}

function isGeohash(input) {
  return input.wkt && input.wkt.match(/^[0-9a-z]+$/);
}

function h3ToWkt(h3) {
  const boundary = cellToBoundary(h3, true);
  return "POLYGON ((" + boundary.map(x => x[0] + " " + x[1]).join(",") + "))";
}

function quadkeyToWkt(quadkey) {
  const bbox = quadkeytools.bbox(quadkey);
  const left = bbox.min.lng;
  const right = bbox.max.lng;
  const top = bbox.max.lat;
  const bottom = bbox.min.lat;
  return "POLYGON ((" +
    left + " " + top + ", " +
    right + " " + top + ", " +
    right + " " + bottom + ", " +
    left + " " + bottom + ", " +
    left + " " + top +
    "))";
}

function geohashToWkt(hash) {
    // TODO: handle WKB as well
    const [bottom, left, top, right] = geohash.decode_bbox(hash);
    return "POLYGON ((" +
      left + " " + top + ", " +
      right + " " + top + ", " +
      right + " " + bottom + ", " +
      left + " " + bottom + ", " +
      left + " " + top +
      "))";
}

function bboxToWkt(bbox) {
  const [left, top, right, bottom] = bbox.split(",").map(x => parseFloat(x.trim()));
  return "POLYGON ((" +
    left + " " + top + ", " +
    right + " " + top + ", " +
    right + " " + bottom + ", " +
    left + " " + bottom + ", " +
    left + " " + top +
    "))";
}

async function transformInput(input) {
  input = {
    ...input,
    proj: null,
    json: null,
    wkb: null,
    ewkb: null
  }

  // handle alternate input formats

  if (isH3(input)) {
    input.wkt = h3ToWkt(input.wkt);
    input.epsg = 4326;
    toast("Converted H3 to WKT", { icon: "🤖" });
  } else if (isQuadkey(input)) {
    input.wkt = quadkeyToWkt(input.wkt);
    input.epsg = 4326;
    toast("Converted Quadkey to WKT", { icon: "🤖" });
  } else if (isBbox(input)) {
    input.wkt = bboxToWkt(input.wkt);
    input.epsg = 4326;
    toast("Converted BBOX to WKT", { icon: "🤖" });
  } else if (isGeohash(input)) {
    input.wkt = geohashToWkt(input.wkt);
    input.epsg = 4326;
    toast("Converted Geohash to WKT", { icon: "🤖" });
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

  let epsgInt = parseInt(input.epsg);
  if (!epsgInt || epsgInt < 1024 || epsgInt > 32767) {
    throw new ValueError("Invalid EPSG");
  }
  input.proj = await fetchProj(input.epsg);
  if (!input.proj) {
    throw new ValueError("EPSG not found");
  }

  // parse WKT
  
  if (input.proj && wktPart !== "") {
    try {
      input.json = parseWkt(wktPart, input);
      
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

function splitGeometry(geometry) {
  if (geometry.type === "GeometryCollection") { 
    return geometry.geometries;
  } else {
    return [geometry];
  }
}

function layerGroupToWkt(layerGroup) {
  let geometries = [];
  layerGroup.eachLayer(function(layer) {
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
  return wkt;
}

export { parseWkt, transformInput, ValueError, fetchProj, extractAndParseCrs, getBbox, layerGroupToWkt };
