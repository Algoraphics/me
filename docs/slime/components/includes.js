/* global AFRAME, Uint8Array, THREE, emitToClass */

/* This file contains components that are mostly someone else's open source code, that I've
  decided to include for a small amount of fine-grained control. Changes *should* be listed
  as a comment at the beginning of each component.
*/

// Single audio context. Used by audiovisualizer
var context;

/**
 * Audio visualizer system for A-Frame. No changes. This is here in case I want to
   get creative with it in the future.
 */
AFRAME.registerSystem('audioanalyser', {
  init: function () {
    this.analysers = {};
  },

  getOrCreateAnalyser: function (data) {
    if (!context) { context = new AudioContext(); }
    var analysers = this.analysers;
    var analyser = context.createAnalyser();
    var audioEl = data.src;
    var src = audioEl.getAttribute('src');

    if (analysers[src]) { return analysers[src]; }

    var source = context.createMediaElementSource(audioEl)
    source.connect(analyser);
    analyser.connect(context.destination);
    analyser.smoothingTimeConstant = data.smoothingTimeConstant;
    analyser.fftSize = data.fftSize;

    // Store.
    analysers[src] = analyser;
    return analysers[src];
  }
});

/**
 * Audio visualizer component for A-Frame using AnalyserNode. No changes.
 */
AFRAME.registerComponent('audioanalyser', {
  schema: {
    enableBeatDetection: {default: true},
    enableLevels: {default: true},
    enableWaveform: {default: true},
    enableVolume: {default: true},
    fftSize: {default: 2048},
    smoothingTimeConstant: {default: 0.8},
    src: {type: 'selector'},
    unique: {default: false}
  },

  init: function () {
    this.analyser = null;
    this.levels = null;
    this.waveform = null;
    this.volume = 0;
  },

  update: function () {
    var data = this.data;
    var self = this;
    var system = this.system;

    if (!data.src) { return; }

    // Get or create AnalyserNode.
    if (data.unique) {
      init(system.createAnalyser(data));
    } else {
      init(system.getOrCreateAnalyser(data));
    }

    function init (analyser) {
      self.analyser = analyser;
      self.levels = new Uint8Array(self.analyser.frequencyBinCount);
      self.waveform = new Uint8Array(self.analyser.fftSize);
      self.el.emit('audioanalyser-ready', {analyser: analyser});
    }
  },

  /**
   * Update spectrum on each frame.
   */
  tick: function () {
    var data = this.data;
    if (!this.analyser) { return; }

    // Levels (frequency).
    if (data.enableLevels || data.enableVolume) {
      this.analyser.getByteFrequencyData(this.levels);
    }

    // Waveform.
    if (data.enableWaveform) {
      this.analyser.getByteTimeDomainData(this.waveform);
    }

    // Average volume.
    if (data.enableVolume || data.enableBeatDetection) {
      var sum = 0;
      for (var i = 0; i < this.levels.length; i++) {
        sum += this.levels[i];;
      }
      this.volume = sum / this.levels.length;
    }

    // Beat detection.
    if (data.enableBeatDetection) {
      var BEAT_DECAY_RATE = 0.99;
      var BEAT_HOLD = 60;
      var BEAT_MIN = 0.15;  // Volume less than this is no beat.

      var volume = this.volume;
      if (!this.beatCutOff) { this.beatCutOff = volume; }
      if (volume > this.beatCutOff && volume > BEAT_MIN) {
        console.log('[audioanalyser] Beat detected.');
        this.el.emit('audioanalyser-beat');
        this.beatCutOff = volume * 1.5;
        this.beatTime = 0;
      } else {
        if (this.beatTime <= BEAT_HOLD) {
          this.beatTime++;
        } else {
          this.beatCutOff *= BEAT_DECAY_RATE;
          this.beatCutOff = Math.max(this.beatCutOff, BEAT_MIN);
        }
      }
    }
  }
});

/*
  Layout component. Commented detachment listeners because firefox does not handle them well.
  Added building layout because, well, that's exactly what I needed for this project.
*/

AFRAME.registerComponent('layout', {
  schema: {
    angle: {type: 'number', default: false, min: 0, max: 360, if: {type: ['circle']}},
    columns: {default: 1, min: 0, if: {type: ['box']}},
    margin: {default: 1, min: 0, if: {type: ['box', 'line']}},
    marginColumn: {default: 1, min: 0, if: {type: ['box']}},
    marginRow: {default: 1, min: 0, if: {type: ['box']}},
    // Number is the width of individual elements. Will center x value to middle of group
    xcenter: {default: 0},
    clump: {default: 1},
    plane: {default: 'xy'},
    radius: {default: 1, min: 0, if: {type: ['circle', 'cube', 'dodecahedron', 'pyramid']}},
    reverse: {default: false},
    type: {default: 'line', oneOf: ['box', 'circle', 'cube', 'dodecahedron', 'line',
                                    'pyramid']},
    fill: {default: true, if: {type: ['circle']}}
  },

  /**
   * Store initial positions in case need to reset on component removal.
   */
  init: function () {
    var self = this;
    var el = this.el;

    this.children = el.getChildEntities();
    var childs = this.children.length;

    var flip = false;
    
    if (this.children.length < 5) { flip = true;}
    this.initialPositions = [];

    this.children.forEach(function getInitialPositions (childEl) {
      if (childEl.hasLoaded) { return _getPositions(); }
      childEl.addEventListener('loaded', _getPositions);
      function _getPositions () {
        var position = childEl.getAttribute('position');
        self.initialPositions.push([position.x, position.y, position.z]);
      }
    });

    /*el.addEventListener('child-attached', function (evt) {
      // Only update if direct child attached.
      console.log("child attached!");
      if (evt.detail.el.parentNode !== el) { return; }
      self.children.push(evt.detail.el);
      self.update();
    });

    el.addEventListener('child-detached', function (evt) {
      // Only update if direct child detached.
      console.log("child detached!");
      if (self.children.indexOf(evt.detail.el) === -1) { return; }
      self.children.splice(self.children.indexOf(evt.detail.el), 1);
      self.initialPositions.splice(self.children.indexOf(evt.detail.el), 1);
      self.update();
    });*/
  },

  /**
   * Update child entity positions.
   */
  update: function (oldData) {
    //console.log("update called!");
    var children = this.children;
    var data = this.data;
    var definedData;
    var el = this.el;
    var numChildren = children.length;
    var positionFn;
    var positions;
    
    // Calculate different positions based on layout shape.
    switch (data.type) {
      case 'box': {
        positionFn = getBoxPositions;
        break;
      }
      case 'circle': {
        positionFn = getCirclePositions;
        break;
      }
      case 'cube': {
        positionFn = getCubePositions;
        break;
      }
      case 'dodecahedron': {
        positionFn = getDodecahedronPositions;
        break;
      }
      case 'pyramid': {
        positionFn = getPyramidPositions;
        break;
      }
      case 'building': {
        positionFn = getBuildingPositions;
        break;
      }
      default: {
        // Line.
        positionFn = getLinePositions;
      }
    }

    definedData = el.getDOMAttribute('layout');
    positions = positionFn(
      data, numChildren,
      typeof definedData === 'string'
      ? definedData.indexOf('margin') !== -1
      : 'margin' in definedData
    );
    if (data.reverse) { positions.reverse(); }
    setPositions(children, positions);
  },

  /**
   * Reset positions.
   */
  remove: function () {
    this.el.removeEventListener('child-attached', this.childAttachedCallback);
    setPositions(this.children, this.initialPositions);
  }
});

/**
 * Get positions for `box` layout.
 */
function getBoxPositions (data, numChildren, marginDefined) {
  var marginColumn;
  var marginRow;
  var position;
  var positions = [];
  var rows = Math.ceil(numChildren / data.columns);

  marginColumn = data.marginColumn;
  marginRow = data.marginRow;
  if (marginDefined) {
    marginColumn = data.margin;
    marginRow = data.margin;
  }

  var center = 0;
  if (data.xcenter != 0) {
    var gapsize = data.marginColumn - data.xcenter;
    center = data.columns * data.marginColumn / 2 - gapsize;
  }

  for (var row = 0; row < rows; row++) {
    for (var column = 0; column < data.columns; column++) {
      position = [0, 0, 0];
      if (data.plane.indexOf('x') === 0) {
        position[0] = column * marginColumn - center;
      }
      if (data.plane.indexOf('y') === 0) {
        position[1] = column * marginColumn;
      }
      if (data.plane.indexOf('y') === 1) {
        position[1] = row * marginRow;
      }
      if (data.plane.indexOf('z') === 1) {
        position[2] = row * marginRow;
      }
      //console.log("x is " + position[0] + " and y is " + position[1]);
      for (var i = 0; i < data.clump; i++) {
        positions.push(position);
      }
    }
  }

  return positions;
}
//module.exports.getBoxPositions = getBoxPositions;

/**
 * Get positions for `circle` layout.
 */
function getCirclePositions (data, numChildren) {
  var positions = [];

  for (var i = 0; i < numChildren; i++) {
    var rad;

    if (isNaN(data.angle)) {
      rad = i * (2 * Math.PI) / numChildren;
    } else {
      rad = i * data.angle * 0.01745329252;  // Angle to radian.
    }

    //console.log("Rad is " + rad + ", angle is " + data.angle);
    var position = [];
    if (data.plane.indexOf('x') === 0) {
      position[0] = data.radius * Math.cos(rad);
    }
    if (data.plane.indexOf('y') === 0) {
      position[1] = data.radius * Math.cos(rad);
    }
    if (data.plane.indexOf('y') === 1) {
      position[1] = data.radius * Math.sin(rad);
    }
    if (data.plane.indexOf('z') === 1) {
      position[2] = data.radius * Math.sin(rad);
    }
    positions.push(position);
  }
  return positions;
}
//module.exports.getCirclePositions = getCirclePositions;

/**
 * Get positions for `line` layout.
 * TODO: 3D margins.
 */
function getLinePositions (data, numChildren) {
  data.columns = numChildren;
  return getBoxPositions(data, numChildren, true);
}
//module.exports.getLinePositions = getLinePositions;

/**
 * Get positions for `cube` layout.
 */
function getCubePositions (data, numChildren) {
  return transform([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
  ], data.radius / 2);
}
//module.exports.getCubePositions = getCubePositions;

/**
 * Get positions for `dodecahedron` layout.
 */
function getDodecahedronPositions (data, numChildren) {
  var PHI = (1 + Math.sqrt(5)) / 2;
  var B = 1 / PHI;
  var C = 2 - PHI;
  var NB = -1 * B;
  var NC = -1 * C;

  return transform([
    [-1, C, 0],
    [-1, NC, 0],
    [0, -1, C],
    [0, -1, NC],
    [0, 1, C],
    [0, 1, NC],
    [1, C, 0],
    [1, NC, 0],
    [B, B, B],
    [B, B, NB],
    [B, NB, B],
    [B, NB, NB],
    [C, 0, 1],
    [C, 0, -1],
    [NB, B, B],
    [NB, B, NB],
    [NB, NB, B],
    [NB, NB, NB],
    [NC, 0, 1],
    [NC, 0, -1],
  ], data.radius / 2);
}
//module.exports.getDodecahedronPositions = getDodecahedronPositions;

/**
 * Get positions for `pyramid` layout.
 */
function getPyramidPositions (data, numChildren) {
  var SQRT_3 = Math.sqrt(3);
  var NEG_SQRT_1_3 = -1 / Math.sqrt(3);
  var DBL_SQRT_2_3 = 2 * Math.sqrt(2 / 3);

  return transform([
    [0, 0, SQRT_3 + NEG_SQRT_1_3],
    [-1, 0, NEG_SQRT_1_3],
    [1, 0, NEG_SQRT_1_3],
    [0, DBL_SQRT_2_3, 0]
  ], data.radius / 2);
}
//module.exports.getPyramidPositions = getPyramidPositions;

/**
 * Multiply all coordinates by a scale factor and add translate.
 *
 * @params {array} positions - Array of coordinates in array form.
 * @returns {array} positions
 */
function transform (positions, scale) {
  return positions.map(function (position) {
    return position.map(function (point, i) {
      return point * scale;
    });
  });
};

function getBuildingPositions (data, numChildren, marginDefined) {
  var margin = 1;
  if (marginDefined) {
    margin = data.margin;
  }
  return transform([
    [-6, -10, 10],
    [10, -10, 6],
    [6, -10, -10],
    [-10, -10, -6],
    [0, -1, 0],
    [0, 0, -1],
  ], data.radius / 2);
}
/**
 * Set position on child entities.
 *
 * @param {array} els - Child entities to set.
 * @param {array} positions - Array of coordinates.
 */
function setPositions (els, positions) {
  els.forEach(function (el, i) {
    var position = positions[i];
    el.setAttribute('position', {
      x: position[0],
      y: position[1],
      z: position[2]
    });
  });
}

AFRAME.registerComponent('streetlamp', {
  init: function () {
    var pole = document.createElement('a-entity');
    pole.setAttribute('geometry', 'primitive: cylinder; radius: 0.06; height: 5.5');
    pole.setAttribute('material', 'color: #424242; shader: flat');
    pole.setAttribute('position', '0 -1.6 1.24');
    this.el.appendChild(pole);

    var arm = document.createElement('a-entity');
    arm.setAttribute('geometry', 'primitive: cylinder; radius: 0.05; height: 1.6');
    arm.setAttribute('material', 'color: #424242; shader: flat');
    arm.setAttribute('rotation', '-75 0 0');
    arm.setAttribute('position', '0 1.35 0.47');
    this.el.appendChild(arm);

    var head = document.createElement('a-entity');
    head.setAttribute('geometry', 'primitive: box; width: 0.3; height: 0.12; depth: 0.4');
    head.setAttribute('material', 'color: #424242; shader: flat');
    head.setAttribute('position', '0 1.56 -0.3');
    this.el.appendChild(head);
  }
});