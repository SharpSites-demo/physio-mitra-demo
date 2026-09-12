/*! Ripple — Canvas UI (canvasui.dev · github.com/DavidHDev/canvas-ui, MIT) — vanilla WebGL build, adapted for static embed. */
(function () {
  "use strict";
  var MAX_RIPPLES = 12, BASE_SPEED = 340;

  var VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  var FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec4 uRipples[12];
uniform int uCount;
uniform float uSpeed;
uniform float uWavelength;
uniform float uWidth;
uniform float uDecay;
uniform float uRefraction;
uniform float uDispersion;
uniform float uShine;
uniform float uHasContent;
uniform float uMaxX;

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, p);
}

void main () {
  vec2 pUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 frag = pUv * uResolution;

  vec2 grad = vec2(0.0);
  float k = 6.28318530718 / uWavelength;
  float w2 = uWidth * uWidth;

  for (int i = 0; i < 12; i++) {
    if (i >= uCount) break;
    vec4 rp = uRipples[i];
    vec2 dv = frag - rp.xy;
    float r = length(dv);
    float front = uSpeed * rp.z;
    float s = r - front;
    float env = exp(-s * s / w2) * exp(-uDecay * rp.z) * rp.w;
    env *= smoothstep(0.0, 0.08, rp.z);
    env *= inversesqrt(1.0 + front / max(uWavelength, 1.0) * 0.2);
    if (env < 0.0015) continue;
    float dh = (k * cos(s * k) - 2.0 * s / w2 * sin(s * k)) * env;
    grad += dv / max(r, 1.0) * dh * uWavelength * 0.16;
  }

  float g = dot(grad, vec2(-0.55, -0.8));
  float glint = pow(clamp(g * 2.2, 0.0, 1.0), 2.0) * uShine;
  float shade = pow(clamp(-g * 1.6, 0.0, 1.0), 2.0) * uShine * 0.3;

  if (uHasContent < 0.5) {
    float a = clamp(glint * 0.9 + shade * 0.5, 0.0, 0.85);
    outColor = vec4(vec3(glint * 0.9), a);
    return;
  }

  vec2 offs = grad * uRefraction / uResolution;
  vec3 col;
  if (uDispersion > 0.001) {
    float d = uDispersion * 0.35;
    col = vec3(
      page(pUv + offs * (1.0 + d)).r,
      page(pUv + offs).g,
      page(pUv + offs * (1.0 - d)).b
    );
  } else {
    col = page(pUv + offs).rgb;
  }
  col += glint;
  col *= 1.0 - shade;
  outColor = vec4(col, 1.0);
}`;

  var DEFAULTS = {
    amplitude: 0.5, speed: 0.65, wavelength: 80, rings: 2, decay: 1,
    refraction: 100, dispersion: 0.5, shine: 0.5, trigger: "click", interval: 0
  };

  function supportsHtmlInCanvas() {
    try {
      var probe = document.createElement("canvas");
      var ctx = probe.getContext("2d");
      return Boolean(ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function");
    } catch (e) { return false; }
  }

  function createRipple(elements, options) {
    var config = Object.assign({}, DEFAULTS, options || {});
    var source = elements.source, content = elements.content, output = elements.output;

    var gl = output.getContext("webgl2", {
      alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return null;

    var sourceCtx = source.getContext("2d");
    var htmlInCanvas = Boolean(
      sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof source.requestPaint === "function"
    );

    var contentDirty = false;
    var wake = function () {};

    if (htmlInCanvas) {
      source.onpaint = function () {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch (e) {}
      };
    }

    function compile(type, text) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Ripple shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    var vertexShader = compile(gl.VERTEX_SHADER, VERT);
    var fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(program, info.name);
    }

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    var contentMaxX = 1;

    function syncCanvasSize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var width = Math.max(1, Math.round(output.clientWidth * dpr));
      var height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(1, Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)));
      if (htmlInCanvas) {
        var cssWidth = Math.max(1, Math.round(source.clientWidth));
        var cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        source.requestPaint();
      }
    }

    syncCanvasSize();

    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    var ripples = [];
    var rippleData = new Float32Array(MAX_RIPPLES * 4);

    function splash(x, y, strength) {
      if (reducedMotion) return;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x: x, y: y, age: 0, amp: strength === undefined ? 1 : strength });
      start();
    }

    function pruneRipples(delta) {
      var diag = Math.hypot(output.clientWidth, output.clientHeight);
      var speedPx = BASE_SPEED * Math.max(config.speed, 0.05);
      var width = config.wavelength * Math.max(config.rings, 1) * 0.5;
      for (var i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.age += delta;
        var gone =
          rp.age * speedPx > diag + width * 3 ||
          Math.exp(-Math.max(config.decay, 0.05) * rp.age) * rp.amp < 0.012;
        if (gone) ripples.splice(i, 1);
      }
    }

    function render() {
      uploadContent();
      var dpr = output.width / Math.max(output.clientWidth, 1);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uResolution, output.width, output.height);
      for (var i = 0; i < MAX_RIPPLES; i++) {
        var rp = ripples[i];
        rippleData[i * 4] = rp ? rp.x * dpr : 0;
        rippleData[i * 4 + 1] = rp ? rp.y * dpr : 0;
        rippleData[i * 4 + 2] = rp ? rp.age : 0;
        rippleData[i * 4 + 3] = rp ? rp.amp * Math.max(config.amplitude, 0) : 0;
      }
      gl.uniform4fv(uniforms.uRipples, rippleData);
      gl.uniform1i(uniforms.uCount, ripples.length);
      gl.uniform1f(uniforms.uSpeed, BASE_SPEED * Math.max(config.speed, 0.05) * dpr);
      gl.uniform1f(uniforms.uWavelength, Math.max(config.wavelength, 4) * dpr);
      gl.uniform1f(uniforms.uWidth, Math.max(config.wavelength, 4) * Math.max(config.rings, 1) * 0.5 * dpr);
      gl.uniform1f(uniforms.uDecay, Math.max(config.decay, 0.05));
      gl.uniform1f(uniforms.uRefraction, Math.max(config.refraction, 0) * dpr);
      gl.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
      gl.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
      gl.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function renderIdle() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, output.width, output.height);
      if (htmlInCanvas) {
        render();
      } else {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    var raf = 0;
    var lastTime = performance.now();
    var destroyed = false;
    var running = false;
    var visible = true;
    var ambientTimer = 0;

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var reducedMotion = motionQuery.matches;

    function spawnAmbient() {
      var w = output.clientWidth;
      var h = output.clientHeight;
      if (w < 10 || h < 10) return;
      splash(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.7), 0.6 + Math.random() * 0.5);
    }

    function frame(now) {
      if (destroyed) return;
      if (!visible) {
        running = false;
        return;
      }
      var delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
      lastTime = now;
      if (!reducedMotion) {
        pruneRipples(delta);
        if (config.interval > 0) {
          ambientTimer += delta;
          if (ambientTimer >= config.interval) {
            ambientTimer = 0;
            spawnAmbient();
          }
        }
      }
      if (ripples.length > 0) {
        render();
      } else {
        renderIdle();
        if (!contentDirty && (config.interval <= 0 || reducedMotion)) {
          running = false;
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }

    wake = start;
    start();

    function localPoint(event) {
      var rect = output.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    }

    var hoverX = -1e5, hoverY = -1e5;

    function onPointerDown(event) {
      if (config.trigger === "none") return;
      var p = localPoint(event);
      splash(p[0], p[1], 1);
    }
    function onPointerMove(event) {
      if (config.trigger !== "hover") return;
      var p = localPoint(event);
      if (Math.hypot(p[0] - hoverX, p[1] - hoverY) < 56) return;
      hoverX = p[0]; hoverY = p[1];
      splash(p[0], p[1], 0.3);
    }

    content.addEventListener("pointerdown", onPointerDown, { passive: true });
    content.addEventListener("pointermove", onPointerMove, { passive: true });

    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) ripples.length = 0;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);

    var observer = new ResizeObserver(function () {
      syncCanvasSize();
      start();
    });
    observer.observe(output);
    observer.observe(content);

    var intersection = new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1] ? entries[entries.length - 1].isIntersecting : true;
      if (visible) start();
    });
    intersection.observe(output);

    return {
      setOptions: function (next) { Object.assign(config, next); start(); },
      splash: splash,
      resize: function () { syncCanvasSize(); start(); },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        content.removeEventListener("pointerdown", onPointerDown);
        content.removeEventListener("pointermove", onPointerMove);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) source.onpaint = null;
      }
    };
  }

  window.CanvasUIRipple = { createRipple: createRipple, supportsHtmlInCanvas: supportsHtmlInCanvas };
})();
