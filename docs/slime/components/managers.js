/* global AFRAME, THREE, beat, Uint8Array */

var debug = false;

function emitToClass(el, name, message, details='') {
  var els = el.sceneEl.querySelectorAll('.' + name);
  for (var i = 0; i < els.length; i++) {
    els[i].emit(message, details, false);
  }
}

/*
  Controls music playback and emits timed beats to alert other entities about the current
  location in the song. 
  
  Entities must assign themselves the class "beatlistener" with the appropriate number beat
  they'd like to hear. The music manager will send a beat only to those subscribed entities,
  only on that one beat.
*/
AFRAME.registerComponent('music-manager', {
  schema: {
    startpos: {default: -50}, // Initial camera position to kick off song playback
    showbeats: {default: false},
  },
  init: function () {
    this.beatbar = -beat;
    this.beatcount = 0;
    this.time = 0;
    this.song = document.querySelector('#side');
    this.cam = document.querySelector('#rig') || document.querySelector('#camera');
    if (!this.cam) { 
      console.error("Music manager can't find the camera rig!");
      return; 
    }
  },
  tick: function (time, timeDelta) {
    if (window.SLIME_PAUSED) return;
    this.time += timeDelta;
    var data = this.data;
    
    // We want to run until the tick handler is waiting for another beat
    while (this.time > this.beatbar) {
      this.beatbar += beat;
      
      if (this.started) {
        var els = this.el.sceneEl.querySelectorAll('.beatlistener' + this.beatcount);
        for (var i = 0; i < els.length; i++) {
          els[i].emit('beat', this.beatcount, false);
        }
        if (data.showbeats) {
          var campos = this.cam.getAttribute('position');
          console.log('beat' + this.beatcount + '; campos is ' + campos.z + '; song=' + this.song.currentTime.toFixed(3));
        }
        if (this.beatcount == 135) {
          this.el.sceneEl.emit('beat');
        }
        this.beatcount++;
      }
      else {
        var campos = this.cam.getAttribute('position');
        if (campos.z < data.startpos) {
          this.started = true;
          this.time = 0;
          this.beatbar = beat;
          this.song.play();
        }
      }
    }
  }
});

/*
  Will move an object regularly to keep it aligned with the camera. Designed with repeating layouts of
  objects in mind, so the camera will appear to move through the group of objects without ever reaching
  the end.
  
  Works bi-directionally but currently will only stop following or delete itself if the camera passes
  a threshold in the -z direction.
  
  Math is somewhat arbitrary but there's a logic to it. Divides entity into 5 slices. 
  Basically, the goal is to keep the camera in the center slice. Ensures there are always 2/5th of the 
  total object both ahead and behind. Does require that following object has distances between components
  in multiples of 5, or movement jumps will be obvious.
*/
AFRAME.registerComponent('followcamera', {
  schema: {
    length: {default: 2},
    stopfollow: {default: NaN}, // Location at which to stop following
    delete: {default: NaN}, // Location at which to remove the asset
  },
  init: function () {
    this.startpos = this.el.getAttribute('position');
    this.stopfollow = false;
    this.cam = document.querySelector('#rig');
    
    var position = this.el.getAttribute('position');
    var centerfront = position.z - 3 * this.data.length / 5;
    var centerback = position.z - 2 * this.data.length / 5;
  },
  tick: function () {
    if (window.SLIME_PAUSED) return;
    var data = this.data;
    
    var cam = this.cam;
    if (!cam) { return; }
    
    var campos = cam.getAttribute('position');
    var position = this.el.getAttribute('position');
    var centerlow = position.z - 3 * data.length / 5;
    var centerhigh = position.z - 2 * data.length / 5;
    if (!this.stopfollow) {
      if (campos.z < centerlow) {
        position.z -= data.length / 5;
      }
      else if (campos.z > centerhigh) {
        position.z += data.length / 5;
      }
      this.el.setAttribute('position', position);
    }
    if (campos.z < data.stopfollow) {
      this.stopfollow = true;
    }
    if (!isNaN(data.delete)) {
      if (campos.z < data.delete) {
        // Maybe factor into delete function?
        //console.log(this.el.classList);
        if (this.el.classList.contains('slowdelete')) {
          // Add a more complex delete function here, probly just loop through the children and delete one per x tick
        }
        this.el.parentNode.removeChild(this.el); 
      }
    }
  }
});

/*
  Component to move an entity in a given direction at a given speed.
  Accepts emitter events which can update the movement speed.
*/
AFRAME.registerComponent('slide', {
  schema: {
    axis: {default: 'z'},
    speed: {default: -12},
  },
  init: function () {
    this.el.axis = this.data.axis;
    this.el.speed = this.data.speed;
    this.el.setAttribute('class', 'slide');
    this.el.addEventListener('speed', function (event) {
      this.speed = event.detail;
    });
  },
  tick: function (time, timeDelta) {
    if (window.SLIME_PAUSED) return;
    var el = this.el;
    var data = this.data;
    var xdelta = 0; var ydelta = 0; var zdelta = 0;
    switch (this.el.axis) {
      case 'x': {
        xdelta = this.el.speed * (timeDelta / 1000);
      }
      case 'y': {
        ydelta = this.el.speed * (timeDelta / 1000);
      }
      case 'z': {
        zdelta = this.el.speed * (timeDelta / 1000);
      }
    }

    var positionTmp = this.positionTmp = this.positionTmp || {x: 0, y: 0, z: 0};
    var position = el.getAttribute('position');

    positionTmp.x = position.x - xdelta;
    positionTmp.y = position.y + ydelta;
    positionTmp.z = position.z - zdelta;
    
    el.setAttribute('position', positionTmp);
  }
});

/*
  Manage camera state. Accept input signals from menu to determine whether camera should really move.
  Configurable start, stop, and location at which it will slowly rise up.
*/
AFRAME.registerComponent('camera-manager', {
  schema: {
    axis: {default: 'z'},
    speed: {default: 5},
    stop: {default: -100},
    rise: {default: NaN},
    risemax: {default: 25},
    id: {default: ''},
  },
  init: function () {
    var el = this.el;
    
    if (el.getAttribute('id') == 'rig') {
      el.setAttribute('position', '0 1.6 25');
    }
    
    var position = el.getAttribute('position');
    this.el.state = "menu";
    this.initialPos = position.z;
    
    this.el.addEventListener('start', function () {
      this.state = "start";
    });
    
    // Only the main camera manager should have freedom of movement in debug mode
    if (debug && this.data.id == 'main') {
      this.el.setAttribute('wasd-controls', "acceleration: 500; fly: false");
    }
  },
  tick: function (time, timeDelta) {
    if (window.SLIME_PAUSED) return;
    var el = this.el;
    var data = this.data;
    
    if (this.el.state == "done") {
      return; 
    }
    else if (el.state == "start") {
      var xdelta = 0; var ydelta = 0; var zdelta = 0;
      switch (data.axis) {
        case 'x': {
          xdelta = data.speed * (timeDelta / 1000);
        }
        case 'y': {
          ydelta = data.speed * (timeDelta / 1000);
        }
        case 'z': {
          zdelta = data.speed * (timeDelta / 1000);
        }
      }

      var positionTmp = this.positionTmp = this.positionTmp || {x: 0, y: 0, z: 0};
      var position = el.getAttribute('position');

      // Raise camera slowly after passing rise threshold
      if (position.z < data.rise && position.y < data.risemax) {
        ydelta += 0.5 * (timeDelta / 1000);
      }

      //positionTmp.y = 30;
      positionTmp.x = position.x - xdelta;
      positionTmp.y = position.y + ydelta;
      positionTmp.z = position.z - zdelta;
      
      if (position.z < data.stop) {
        this.el.state = "done";
      }
      
      el.setAttribute('position', positionTmp);
    }
  }
});

/*
  Simply listens for a beat and makes itself visible at that beat.
*/
AFRAME.registerComponent('timedinvisible', {
  init: function () {
    var el = this.el;
    el.setAttribute('visible', true);
    el.addEventListener('beat', function (event) {
      this.setAttribute('visible', false);
    })
  }
});

/*
  Removes itself when a certain beat is hit
*/
AFRAME.registerComponent('timedisabler', {
  init: function () {
    this.el.addEventListener('beat', function (event) {
      this.parentNode.removeChild(this);
    });
  }
});

AFRAME.registerComponent('gotospace', {
  init: function () {
    this.el.blastoff = false;
    
    this.el.addEventListener('beat', function (event) {
      this.blastoff = true;
    });
    
    this.index = 0;
  },
  removeEl: function (sel) {
    var el = document.querySelector(sel);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },
  tick: function () {
    if (window.SLIME_PAUSED) return;
    if (this.el.blastoff) {
      switch(this.index) {
        case 2:
          this.removeEl('#boxleft');
          this.removeEl('#boxright');
          break;
        case 3:
          this.removeEl('#boxfront');
          this.removeEl('#boxback');
          break;
        case 4:
          this.removeEl('#gridleft');
          this.removeEl('#gridright');
          break;
        case 6:
          this.removeEl('#floor');
          this.removeEl('#floorleft');
          this.removeEl('#flooright');
          this.removeEl('#road');
          break;
        case 8:
          var sky = document.querySelector('#sunsky');
          if (sky) sky.setAttribute('visible', false);
          var starcolor = document.querySelector('#starcolor');
          if (starcolor) starcolor.setAttribute('animation__vanish', "property: material.opacity; from: 0.4; to: 0;");
          break; 
      }
      this.index++;
    }
  }
});

AFRAME.registerComponent('removetunnels', {
  removeEl: function (sel) {
    var el = document.querySelector(sel);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },
  init: function () {
    var self = this;
    this.el.addEventListener('beat', function (event) {
      switch(event.detail) {
        case 352:
          self.removeEl('#ringportal');
          self.removeEl('#buildingportal');
          this.setAttribute('class', 'beatlistener' + (event.detail + 30));
          console.log("Removing ring and building!");
          break;
        case 382:
          self.removeEl('#discotunnel');
          self.removeEl('#electrictunnel');
          this.setAttribute('class', 'beatlistener' + (event.detail + 2));
          console.log("Removing disco and electric!");
          break;
        case 384:
          var kal = document.querySelector('#kaltunnel');
          if (kal) {
            kal.setAttribute('animation__scale2', "property: scale; from: 1 1 1; to: 0.01 0.01 0.01;");
            kal.setAttribute('animation__visible', "property: visible; from: true; to: false; delay: 1000");
          }
      }
    });
  },
});

/*
  Uses kevin ngo's audioanalyser component to make an entity scale, move, or light up
  to the beat of a song
*/
AFRAME.registerComponent('audio-react', {
  schema: {
    analyserEl: {type: 'selector'},
    property: {default: 'scale'},
    multiplier: {default: 1}, //
    build: {default: 0}, // Slowly build to full volume (num is speed)
    stablebase: {default: true}, // Stabilize bottom of scaling asset
    startbeat: {default: 0},
  },
  init: function () {
    this.build = 0;
    var analyser = document.createElement('a-entity');
    
    this.analyserEl = analyser;
    this.firstpos = this.el.getAttribute('position').y;
    if (!this.data.build) {
      this.build = 1;
    }
    else this.build = 0.5;
    this.cam = document.querySelector('#rig');
    this.el.setAttribute('class', 'beatlistener' + this.data.startbeat);
    this.el.addEventListener('beat', function (event) {
      if (this.started) {
        this.ended = true
      }
      this.started = true;
      this.setAttribute('class', 'beatlistener464');
    });
  },
  tick: function () {
    if (window.SLIME_PAUSED) return;
    var data = this.data;
    var analyserEl = data.analyserEl;
    var volume = 0;
    var levels;
    
    var campos = this.cam.getAttribute('position');
    
    if (!this.el.started) {
      return;
    }
    
    if (analyserEl) {
       //var sound = song.components.sound;
       volume = analyserEl.components.audioanalyser.volume * data.multiplier * 0.05;
    }
    else return;
    
    if (this.build < 1) {
      this.build += 0.001 * data.build;
    }
    var val = volume * this.build;
    var curprop = this.el.getAttribute(data.property);
    if (data.property == 'position') {
      if (data.reverse) {
        val = -val; 
      }
      this.el.setAttribute(data.property, {
        x: curprop.x,
        y: val,
        z: curprop.z
      });
    }
    else if (data.property == 'scale') {
      val = val / 2;
      this.el.setAttribute(data.property, {
        x: val,
        y: val,
        z: val
      });
      if (data.stablebase) {
        var curpos = this.el.getAttribute('position');
        var sety = this.firstpos + val/2 - 0.5;
        this.el.setAttribute('position', {
          x: curpos.x,
          // TODO: this may not work with moving objects, will always reset y position to initial
          y: sety,
          z: curpos.z
        });
      }
    }
    else if (data.property == 'shader-color') {
      val = val / 4;
      var color = this.el.children[0].getObject3D('mesh').material.uniforms['color1']['value'];
      color.x = val*val;
      color.y = val*val;
      if (this.el.ended) {
        color.x = 1; color.y = 1;
      }
      this.el.children[0].getObject3D('mesh').material.uniforms['color1']['value'] = color;
      this.el.children[0].getObject3D('mesh').material.uniforms['color2']['value'] = color;
    }
  }
});