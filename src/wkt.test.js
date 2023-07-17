import { parseWkt, fetchProj } from "./wkt";

describe("parseWkt", () => {
    it("parses wkt", () => {
        const wkt = "POINT (30 10)";
        const json = parseWkt(wkt);
        expect(json).toEqual({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [30, 10]
            },
            "properties": null
        });
    });
});        

describe("fetchProj", () => {
    it("fetches proj", () => {
        (async ()  =>{
            const proj = await fetchProj(4326);
            expect(proj).toEqual("+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees");
        })();
    });
});