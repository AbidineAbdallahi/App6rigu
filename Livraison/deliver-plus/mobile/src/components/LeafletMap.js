import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}.leaflet-control-attribution{display:none}</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
map.setView([18.0735,-15.9582],13);

var driverM=null,pickupM=null,deliveryM=null,routeL=null,accuracyC=null;

var driverIcon=L.divIcon({
  html:'<div style="width:24px;height:24px;border-radius:50%;background:rgba(83,74,183,0.25);display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:50%;background:#534AB7;border:2.5px solid white"></div></div>',
  className:'',iconSize:[24,24],iconAnchor:[12,12]
});

function updateRoute(){
  if(routeL){routeL.remove();routeL=null;}
  var dest=deliveryM||pickupM;
  if(driverM&&dest){
    routeL=L.polyline([driverM.getLatLng(),dest.getLatLng()],{
      color:deliveryM?'#185FA5':'#3B6D11',weight:3,dashArray:'10,5'
    }).addTo(map);
  }
}

window.setDriver=function(lat,lng,acc){
  var ll=[lat,lng];
  if(driverM)driverM.setLatLng(ll);
  else driverM=L.marker(ll,{icon:driverIcon,zIndexOffset:1000}).addTo(map);
  if(acc!=null){
    if(accuracyC){accuracyC.setLatLng(ll);accuracyC.setRadius(acc);}
    else accuracyC=L.circle(ll,{radius:acc,color:'rgba(83,74,183,0.3)',fillColor:'rgba(83,74,183,0.08)',weight:1}).addTo(map);
  }
  updateRoute();
};

window.setPickup=function(lat,lng){
  if(pickupM){pickupM.remove();pickupM=null;}
  if(lat!=null)pickupM=L.marker([lat,lng]).bindPopup('📍 Retrait').addTo(map);
  updateRoute();
};

window.setDelivery=function(lat,lng){
  if(deliveryM){deliveryM.remove();deliveryM=null;}
  if(lat!=null)deliveryM=L.marker([lat,lng]).bindPopup('🏠 Livraison').addTo(map);
  updateRoute();
};

window.centerMap=function(lat,lng,zoom){
  map.setView([lat,lng],zoom||15,{animate:true});
};

window.fitCoords=function(coords){
  if(!coords||!coords.length)return;
  if(coords.length===1){map.setView(coords[0],15,{animate:true});return;}
  map.fitBounds(coords,{padding:[60,40],animate:true,maxZoom:16});
};

setTimeout(function(){
  try{window.ReactNativeWebView.postMessage('ready');}catch(e){}
},300);
</script>
</body>
</html>`;

const LeafletMap = forwardRef(function LeafletMap({ style }, ref) {
  const webviewRef = useRef(null);
  const readyRef   = useRef(false);
  const queue      = useRef([]);

  const inject = (js) => {
    if (readyRef.current) {
      webviewRef.current?.injectJavaScript(js + '; true;');
    } else {
      queue.current.push(js);
    }
  };

  useImperativeHandle(ref, () => ({
    setDriver:  (lat, lng, acc) => inject(`window.setDriver(${lat},${lng},${acc ?? 'null'})`),
    setPickup:  (lat, lng)      => inject(`window.setPickup(${lat ?? 'null'},${lng ?? 'null'})`),
    setDelivery:(lat, lng)      => inject(`window.setDelivery(${lat ?? 'null'},${lng ?? 'null'})`),
    centerMap:  (lat, lng, z)   => inject(`window.centerMap(${lat},${lng},${z ?? 15})`),
    fitCoords:  (coords)        => inject(`window.fitCoords(${JSON.stringify(coords)})`),
  }));

  const onMessage = (e) => {
    if (e.nativeEvent.data === 'ready') {
      readyRef.current = true;
      queue.current.forEach(js => webviewRef.current?.injectJavaScript(js + '; true;'));
      queue.current = [];
    }
  };

  return (
    <WebView
      ref={webviewRef}
      source={{ html: MAP_HTML }}
      style={[styles.map, style]}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
      mixedContentMode="always"
    />
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
});

export default LeafletMap;
