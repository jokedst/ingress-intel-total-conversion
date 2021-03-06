// ==UserScript==
// @id             fly-links@fly
// @name           IITC plugin: Fly Links
// @category       Layer
// @version        0.2.2.@@DATETIMEVERSION@@
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDNAME@@-@@BUILDDATE@@] Calculate how to link the portals to create the largest tidy set of nested fields. Enable from the layer chooser.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin
window.plugin.flyLinks = function() {};

// const values
window.plugin.flyLinks.MAX_PORTALS_TO_OBSERVE = 1000;
window.plugin.flyLinks.MAX_PORTALS_TO_LINK = 100;
// zoom level used for projecting points between latLng and pixel coordinates. may affect precision of triangulation
window.plugin.flyLinks.PROJECT_ZOOM = 16;

window.plugin.flyLinks.locked = false;
window.plugin.flyLinks.drawToolsIntegration = true;

window.plugin.flyLinks.linksLayerGroup = null;
window.plugin.flyLinks.fieldsLayerGroup = null;

window.plugin.flyLinks.updateLayer = function() {
  if (!window.map.hasLayer(window.plugin.flyLinks.linksLayerGroup) &&
      !window.map.hasLayer(window.plugin.flyLinks.fieldsLayerGroup))
    return;

  window.plugin.flyLinks.linksLayerGroup.clearLayers();
  window.plugin.flyLinks.fieldsLayerGroup.clearLayers();

  var drawLink = function(a, b, style) {
    var alatlng = map.unproject(a, window.plugin.flyLinks.PROJECT_ZOOM);
    var blatlng = map.unproject(b, window.plugin.flyLinks.PROJECT_ZOOM);

    var poly = L.polyline([alatlng, blatlng], style);
    poly.addTo(window.plugin.flyLinks.linksLayerGroup);
  }
  
  var drawField = function(a, b, c, style) {
    var alatlng = map.unproject(a, window.plugin.flyLinks.PROJECT_ZOOM);
    var blatlng = map.unproject(b, window.plugin.flyLinks.PROJECT_ZOOM);
    var clatlng = map.unproject(c, window.plugin.flyLinks.PROJECT_ZOOM);
    
    var poly = L.polygon([alatlng, blatlng, clatlng], style);
    poly.addTo(window.plugin.flyLinks.fieldsLayerGroup);
  }
    
  var isPointInPoly = function(poly, pt) {
    var c = false, i = -1, l = poly.length, j = l - 1;
    for(; ++i < l; j = i){
      if (((poly[i].lng <= pt.lng && pt.lng < poly[j].lng) || (poly[j].lng <= pt.lng && pt.lng < poly[i].lng))
      && (pt.lat < (poly[j].lat - poly[i].lat) * (pt.lng - poly[i].lng) / (poly[j].lng - poly[i].lng) + poly[i].lat))
        c = !c;
    }
    return c;
  }
    
  if(!window.plugin.flyLinks.locked || !window.plugin.flyLinks.triangulation){
  var ctrl = [$('.leaflet-control-layers-selector + span:contains("Fly links")').parent(), 
              $('.leaflet-control-layers-selector + span:contains("Fly fields")').parent()];
  if (Object.keys(window.portals).length > window.plugin.flyLinks.MAX_PORTALS_TO_OBSERVE) {
    $.each(ctrl, function(guid, ctl) {ctl.addClass('disabled').attr('title', 'Too many portals: ' + Object.keys(window.portals).length);});
    return;
  }
  
  var locations = [];
      
  // Find drawn polygons
  var polys = [];
  if(window.plugin.drawTools && window.plugin.flyLinks.drawToolsIntegration){
    $.each(window.plugin.drawTools.drawnItems._layers, function (name, layer) {
      if (layer instanceof L.Polygon) {
        var poly = layer._latlngs;
        polys.push(poly);
      }
    });
  }

  var bounds = map.getBounds();
  $.each(window.portals, function(guid, portal) {
    var ll = portal.getLatLng();
    if (bounds.contains(ll)) {        
      var inpoly = false;
      for (var p = 0; p < polys.length; p++) {
        if (isPointInPoly(polys[p], ll)) {
          inpoly = true;
          break;
        }
      }

      if (polys.length == 0 || inpoly) {
        var p = map.project(portal.getLatLng(), window.plugin.flyLinks.PROJECT_ZOOM);
        locations.push(p);
      }
    }
  });

  var distance = function(a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
  };
  
  if (locations.length > window.plugin.flyLinks.MAX_PORTALS_TO_LINK) {
    $.each(ctrl, function(guid, ctl) {ctl.addClass('disabled').attr('title', 'Too many portals (linked/observed): ' + locations.length + '/' + Object.keys(window.portals).length);});
    return;
  }
  $.each(ctrl, function(guid, ctl) {ctl.removeClass('disabled').attr('title', 'portals (linked/observed): ' + locations.length + '/' + Object.keys(window.portals).length);});
  
  var EPS = 1e-9;
  var det = function(a, b, c) {
    return a.x * b.y - a.y * b.x + b.x * c.y - b.y * c.x + c.x * a.y - c.y * a.x;
  }
  
  var convexHull = function(points) {
    if (points.length < 3)
      return [];
    var result = [];
    var func = function _func(ai, bi, index) {
      var maxd = 0;
      var maxdi = -1;
      var a = points[ai];
      var b = points[bi];
      var _index = [];
      for (var i = 0; i < index.length; ++i) {
        var c = points[index[i]];
        var d = -det(a, b, c);
        if (d > EPS) {
            _index.push(index[i]);
        }
        if (maxd < d - EPS) {
          maxd = d;
          maxdi = index[i];
        }
      }
      if (maxdi != -1) {
        _func(ai, maxdi, _index);
        _func(maxdi, bi, _index);
      } else {
        result.push(ai);
      }
    }
    var minxi = 0;
    var maxxi = 0;
    var index = [];
    for (var i = 0; i < points.length; ++i) {
      index.push(i);
      if (points[minxi].x > points[i].x)
        minxi = i;
      if (points[maxxi].x < points[i].x)
        maxxi = i;
    }
    func(minxi, maxxi, index);
    func(maxxi, minxi, index);
    return result;
  }
  
  var index = convexHull(locations);
  
  var triangulate = function(index, locations) {
    if (index.length == 0)
      return {edges: [], triangles: []};
    var data = [];
    var subtriangulate = function _subtriangulate(ai, bi, ci, index) {
      var _i = [ai, bi, ci].sort(function(a,b){return a-b;});
      if (data[_i[0]] === undefined)
        data[_i[0]] = [];
      if (data[_i[0]][_i[1]-_i[0]] === undefined)
        data[_i[0]][_i[1]-_i[0]] = [];
      if (data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]] === undefined) {
        var _index = [];
        for (var i = 0; i < index.length; ++i) {
          var detc = det(locations[ai], locations[bi], locations[index[i]]);
          var deta = det(locations[bi], locations[ci], locations[index[i]]);
          var detb = det(locations[ci], locations[ai], locations[index[i]]);
          if (deta > EPS && detb > EPS && detc > EPS) {
            _index.push(index[i]);
          }
        }
        var besth = 0;
        var besthi = -1;
        if (_index.length == 0) {
          var a = locations[ai];
          var b = locations[bi];
          var c = locations[ci];
          var s = Math.abs(det(a, b, c));
          var ch = s / distance(a, b);
          var ah = s / distance(b, c);
          var bh = s / distance(c, a);
          besth = Math.min(ah, bh, ch);
          besthi = -1;
        } else {
          var besths = 0;
          for (var i = 0; i < _index.length; ++i) {
            var ch = _subtriangulate(ai, bi, _index[i], _index);
            var ah = _subtriangulate(bi, ci, _index[i], _index);
            var bh = _subtriangulate(ci, ai, _index[i], _index);
            var _besth = Math.min(ah, bh, ch);
            var _besths = ah + bh + ch;
            if (besth < _besth || Math.abs(besth - _besth) <= EPS && besths < _besths) {
              besth = _besth;
              besths = _besths;
              besthi = _index[i];
            }
          }
        }
        data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]] = {height: besth, index: besthi};
      }
      return data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].height;
    }
    var subindex = [];
    for (var i = 0; i < locations.length; ++i) {
      subindex.push(i);
    }
    var best = [];
    for (var len = 1; len <= index.length - 1; ++len) {
      best[len] = [];
      for (var k = 0; k < index.length - len; ++k) {
        var t = 0;
        var tlen = -1;
        for (var _len = 1; _len <= len - 1; ++_len) {
          var _t = 0;
          $.each([best[_len][k].height, best[len-_len][k+_len].height, subtriangulate(index[k], index[k+_len], index[k+len], subindex)], function(guid, __t) {
            if (__t == 0)
              return;
            if (_t == 0 || _t > __t)
              _t = __t;
          });
          if (t == 0 || t < _t) {
            t = _t;
            tlen = _len;
          }
        }
        best[len][k] = {height: t, length: tlen};
      }
    }
    
    var edges = [];
    var triangles = [];
    var makesubtriangulation = function _makesubtriangulation(ai, bi, ci, depth) {
      var _i = [ai, bi, ci].sort(function(a,b){return a-b;});
      if (data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index == -1) {
        triangles.push(new window.plugin.flyLinks.Triangle(locations[ai], locations[bi], locations[ci], depth));
      } else {
        _makesubtriangulation(ai, bi, data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index, depth+1);
        _makesubtriangulation(bi, ci, data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index, depth+1);
        _makesubtriangulation(ci, ai, data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index, depth+1);
        edges.push(new window.plugin.flyLinks.Edge(locations[ai], locations[data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index], depth));
        edges.push(new window.plugin.flyLinks.Edge(locations[bi], locations[data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index], depth));
        edges.push(new window.plugin.flyLinks.Edge(locations[ci], locations[data[_i[0]][_i[1]-_i[0]][_i[2]-_i[1]].index], depth));
      }
    }
    var maketriangulation = function _maketriangulation(len, a) {
      edges.push(new window.plugin.flyLinks.Edge(locations[index[a]], locations[index[a+len]], 0));
      if (best[len][a].length == -1)
        return;
      makesubtriangulation(index[a], index[a+best[len][a].length], index[a+len], 1);
      _maketriangulation(best[len][a].length, a);
      _maketriangulation(len - best[len][a].length, a + best[len][a].length);
    }
    maketriangulation(index.length - 1, 0);
    return {edges: edges, triangles: triangles};
  }
  
    window.plugin.flyLinks.triangulation = triangulate(index, locations);
  }
  var edges = window.plugin.flyLinks.triangulation.edges;
  var triangles = window.plugin.flyLinks.triangulation.triangles;

  $.each(edges, function(idx, edge) {
    drawLink(edge.a, edge.b, {
      color: '#FF0000',
      opacity: 1,
      weight: 1.5,
      clickable: false,
      smoothFactor: 10,
      dashArray: [6, 4],
    });
  });
  
  $.each(triangles, function(idx, triangle) {
    drawField(triangle.a, triangle.b, triangle.c, {
      stroke: false,
      fill: true,
      fillColor: '#FF0000',
      fillOpacity: 1 - Math.pow(0.85, triangle.depth),
      clickable: false,
    });
  });
}

window.plugin.flyLinks.Edge = function(a, b, depth) {
  this.a = a;
  this.b = b;
  this.depth = depth;
}

window.plugin.flyLinks.Triangle = function(a, b, c, depth) {
  this.a = a;
  this.b = b;
  this.c = c;
  this.depth = depth;
}

window.plugin.flyLinks.showOptions = function () {
    dialog({
        html: '<div>Lock plan: <input type="checkbox" style="height:inherit" onclick="window.plugin.flyLinks.setOption(\'locked\', this.checked)" ' + (window.plugin.flyLinks.locked ? 'checked="checked"' : '') + ' /></br>' +
            'Draw Tools integration: <input type="checkbox" style="height:inherit" onclick="window.plugin.flyLinks.setOption(\'drawToolsIntegration\', this.checked)" ' + (window.plugin.flyLinks.drawToolsIntegration ? 'checked="checked"' : '') + ' />' +
            '</div>',
        title: 'Fly Links Options'
    });
}

window.plugin.flyLinks.setOption = function (name, value) {
    switch (name) {
        case 'locked': window.plugin.flyLinks.locked = value; break;
        case 'drawToolsIntegration': window.plugin.flyLinks.drawToolsIntegration = value; break;
    }
    window.plugin.flyLinks.updateLayer();
}

window.plugin.flyLinks.setup = function() {
  window.plugin.flyLinks.linksLayerGroup = new L.LayerGroup();
  window.plugin.flyLinks.fieldsLayerGroup = new L.LayerGroup();
  
  window.addHook('mapDataRefreshEnd', function(e) {
    window.plugin.flyLinks.updateLayer();
  });

  window.map.on('moveend', function() {
    window.plugin.flyLinks.updateLayer();
  });

  window.addLayerGroup('Fly links', window.plugin.flyLinks.linksLayerGroup, false);
  window.addLayerGroup('Fly fields', window.plugin.flyLinks.fieldsLayerGroup, false);
    
  // When somwthing has been drawn in drawTools, update graph    
  map.on('draw:created', function (e) {
      // Draw Tools hasn't necessarily added the layer yet, so let that trigger fire before doing the update (thus the setTimeout)
      setTimeout(function () {
          window.plugin.flyLinks.updateLayer();
      }, 0);
  });
  map.on('draw:deleted', function (e) {
      window.plugin.flyLinks.updateLayer();
  });
  map.on('draw:edited', function (e) {
      window.plugin.flyLinks.updateLayer();
  });

  // Add options menu
  $('#toolbox').append('<a onclick="window.plugin.flyLinks.showOptions();return false;">FlyLinks</a>');
}
var setup = window.plugin.flyLinks.setup;

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
