import { createControlComponent } from "@react-leaflet/core";
import L from "leaflet";
import "leaflet-fullscreen/dist/Leaflet.fullscreen.js";
import "leaflet-fullscreen/dist/leaflet.fullscreen.css";

const FullscreenControl = createControlComponent(
  (props) => new L.control.fullscreen(props)
);

export default FullscreenControl;