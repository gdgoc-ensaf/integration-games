// GDG ENSAF — Mesh Drift WebGL Shader Background
// Cloned exactly from GDGC-WEBSITE (gdgensaf.web.app)
(function() {
  'use strict';
  const isWorker = typeof document === 'undefined';

  const VERT = `attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }`;

  const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform vec3 u_colors[8];
  uniform vec4 u_scene;      // resolution.xy, time, colour count
  uniform vec4 u_shape;      // scale, intensity, paramA, warp
  uniform vec4 u_surface;    // detail, contrast, brightness, saturation
  uniform vec4 u_finish;     // hue, vignette, blur, grain
  uniform vec4 u_transform;  // seed, rotation, drift, OKLab toggle
  uniform vec4 u_space;      // offset.xy, pointer.xy
  uniform vec4 u_cursor;

  #define u_resolution u_scene.xy
  #define u_time u_scene.z
  #define u_colorCount u_scene.w
  #define u_scale u_shape.x
  #define u_intensity u_shape.y
  #define u_paramA u_shape.z
  #define u_warp u_shape.w
  #define u_detail u_surface.x
  #define u_contrast u_surface.y
  #define u_brightness u_surface.z
  #define u_saturation u_surface.w
  #define u_hue u_finish.x
  #define u_vignette u_finish.y
  #define u_blur u_finish.z
  #define u_grain u_finish.w
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  #define u_seed u_transform.x
  #else
  #define u_seed mod(u_transform.x, 31.0)
  #endif
  #define u_rotate u_transform.y
  #define u_drift u_transform.z
  #define u_oklab u_transform.w
  #define u_offset u_space.xy
  #define u_mouse u_space.zw
  #define u_cursorPresence u_cursor.x
  #define u_cursorEffect u_cursor.y
  #define u_cursorStrength u_cursor.z
  #define u_cursorRadius u_cursor.w

  float hash21(vec2 p) {
  #ifndef GL_FRAGMENT_PRECISION_HIGH
    p = mod(p, 31.0);
  #endif
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float grainHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.0, 9.2);
      a *= 0.5;
    }
    return v;
  }

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.031308, c));
  }
  vec3 linToOklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    l = pow(max(l, 0.0), 1.0 / 3.0);
    m = pow(max(m, 0.0), 1.0 / 3.0);
    s = pow(max(s, 0.0), 1.0 / 3.0);
    return vec3(
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
  }
  vec3 oklabToLin(vec3 c) {
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return vec3(
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  }
  vec3 mixColour(vec3 a, vec3 b, float t) {
    if (u_oklab > 0.5) {
      vec3 la = linToOklab(srgbToLinear(a));
      vec3 lb = linToOklab(srgbToLinear(b));
      return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
    }
    return mix(a, b, t);
  }

  vec3 hueRotate(vec3 col, float a) {
    const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYIQ * col;
    float ca = cos(a), sa = sin(a);
    yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
    return toRGB * yiq;
  }

  vec3 shade(vec2 uv, vec2 p, float t) {
    vec3 acc = u_colors[0] * 0.15;
    float total = 0.15;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_colorCount) break;
      float fi = float(i);
      vec2 c = vec2(
        sin(t * (0.21 + fi * 0.071) + fi * 2.4 + u_seed),
        cos(t * (0.17 + fi * 0.093) + fi * 1.7)) * (0.45 + u_intensity * 0.35);
      float w = exp(-dot(p - c, p - c) * 6.0);
      acc += u_colors[i] * w;
      total += w;
    }
    return acc / total;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 screenUv = uv;
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
    p *= u_scale;
    if (abs(u_rotate) > 0.0001) {
      float cr = cos(u_rotate), sr = sin(u_rotate);
      p = mat2(cr, -sr, sr, cr) * p;
    }
    p += u_offset;
    if (u_drift > 0.0001)
      p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
    if (u_warp > 0.0) {
      p += u_warp * (vec2(fbm(p * u_detail + u_seed), fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
    }
    vec3 col;
    if (u_blur > 0.0) {
      float e = u_blur;
      float pe = e * u_scale;
      vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
      col  = shade(uv, p, u_time) * 0.36;
      col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
      col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
      col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
      col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
    } else {
      col = shade(uv, p, u_time);
    }
    if (abs(u_contrast - 1.0) > 0.0001)
      col = (col - 0.5) * u_contrast + 0.5;
    if (abs(u_saturation - 1.0) > 0.0001) {
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, u_saturation);
    }
    if (abs(u_hue) > 0.0001)
      col = hueRotate(col, u_hue);
    if (abs(u_brightness) > 0.0001)
      col += u_brightness;
    if (u_vignette > 0.0001) {
      float vd = length(screenUv - 0.5) * 1.41421356;
      col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
    }
    if (u_grain > 0.0001)
      col += (grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  const LIGHT_COLORS = [
    [1, 1, 1],
    [0.9607843137254902, 0.9607843137254902, 0.9607843137254902],
    [0.10588235294117647, 0.41568627450980394, 0.6549019607843137],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393]
  ];

  const DARK_COLORS = [
    [0.0745, 0.0745, 0.0784],
    [0.1255, 0.1294, 0.1412],
    [0.0588, 0.1568, 0.3216],
    [0.1412, 0.2588, 0.4588],
    [0.0588, 0.1568, 0.3216],
    [0.1412, 0.2588, 0.4588],
    [0.0745, 0.0745, 0.0784],
    [0.1255, 0.1294, 0.1412]
  ];

  const UNIFORMS = {
    colorCount: 4,
    scale: 1.300,
    intensity: 0.380,
    paramA: 0.670,
    warp: 0.192,
    detail: 2.016,
    contrast: 1.050,
    brightness: 0.060,
    saturation: 0.750,
    hue: 0.0000,
    vignette: 0.280,
    blur: 0.0072,
    grain: 0.070,
    seed: 5069.0,
    rotate: 2.7227,
    offsetX: 0.090,
    offsetY: 0.150,
    drift: 0.148,
    cursorEnabled: false,
    cursorEffect: 2.0,
    cursorStrength: 0.650,
    cursorRadius: 0.460,
    oklab: 0.0,
    timeScale: -1.373
  };

  async function initShader(canvas, viewport, initialTheme) {
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
    if (!gl) {
      if (isWorker) self.postMessage({ type: 'fallback' });
      return;
    }
    const parallelCompile = gl.getExtension('KHR_parallel_shader_compile');

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Let the driver compile without blocking input or the first page paint.
    if (parallelCompile) {
      while (!gl.getProgramParameter(program, parallelCompile.COMPLETION_STATUS_KHR)) {
        await new Promise(requestAnimationFrame);
      }
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (isWorker) self.postMessage({ type: 'fallback' });
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uni = {
      colors: gl.getUniformLocation(program, 'u_colors'),
      scene: gl.getUniformLocation(program, 'u_scene'),
      shape: gl.getUniformLocation(program, 'u_shape'),
      surface: gl.getUniformLocation(program, 'u_surface'),
      finish: gl.getUniformLocation(program, 'u_finish'),
      transform: gl.getUniformLocation(program, 'u_transform'),
      space: gl.getUniformLocation(program, 'u_space'),
      cursor: gl.getUniformLocation(program, 'u_cursor')
    };

    const isInitiallyDark = initialTheme === 'dark';
    let currentColors = (isInitiallyDark ? DARK_COLORS : LIGHT_COLORS).map(c => [...c]);

    gl.uniform3fv(uni.colors, new Float32Array(currentColors.flat()));
    gl.uniform4f(uni.shape, UNIFORMS.scale, UNIFORMS.intensity, UNIFORMS.paramA, UNIFORMS.warp);
    gl.uniform4f(uni.surface, UNIFORMS.detail, UNIFORMS.contrast, UNIFORMS.brightness, UNIFORMS.saturation);
    gl.uniform4f(uni.finish, UNIFORMS.hue, UNIFORMS.vignette, UNIFORMS.blur, UNIFORMS.grain);
    gl.uniform4f(uni.transform, UNIFORMS.seed, UNIFORMS.rotate, UNIFORMS.drift, UNIFORMS.oklab);
    gl.uniform4f(uni.cursor, 0, UNIFORMS.cursorEffect, UNIFORMS.cursorStrength, UNIFORMS.cursorRadius);
    gl.uniform4f(uni.space, UNIFORMS.offsetX, UNIFORMS.offsetY, 0, 0);

    const start = performance.now();
    const colorData = new Float32Array(24);
    let targetColors = isInitiallyDark ? DARK_COLORS : LIGHT_COLORS;
    let colorsTransitioning = false;
    let frameId = null;
    let hidden = false;

    function updateTheme(theme) {
      targetColors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
      colorsTransitioning = true;
    }

    function resize() {
      const dpr = Math.min(viewport.dpr || 1, 1.5);
      const w = Math.max(1, Math.round(viewport.width * dpr));
      const h = Math.max(1, Math.round(viewport.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function render(now) {
      frameId = null;
      if (hidden) return;

      // Smooth color transition on theme change
      if (colorsTransitioning) {
        let hasChanged = false;
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 3; j++) {
            const diff = targetColors[i][j] - currentColors[i][j];
            if (Math.abs(diff) > 0.001) {
              currentColors[i][j] += diff * 0.08;
              hasChanged = true;
            }
          }
        }
        for (let i = 0; i < 8; i++) {
          colorData.set(currentColors[i], i * 3);
        }
        gl.uniform3fv(uni.colors, colorData);
        colorsTransitioning = hasChanged;
      }

      gl.uniform4f(uni.scene, canvas.width, canvas.height, ((now - start) / 1000) * UNIFORMS.timeScale, UNIFORMS.colorCount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frameId = requestAnimationFrame(render);
    }

    function updateVisibility(nextHidden) {
      hidden = nextHidden;
      if (hidden) {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      } else if (frameId === null) {
        resize();
        frameId = requestAnimationFrame(render);
      }
    }
    if (isWorker) {
      self.addEventListener('message', ({ data }) => {
        if (data.type === 'resize') { viewport = data.viewport; resize(); }
        if (data.type === 'theme') updateTheme(data.theme);
        if (data.type === 'visibility') updateVisibility(data.hidden);
      });
      // Synchronize changes that occurred during asynchronous compilation.
      self.postMessage({ type: 'ready' });
    } else {
      window.addEventListener('resize', () => { viewport = getViewport(); resize(); });
      window.addEventListener('themechange', ({ detail }) => updateTheme(detail.theme));
      document.addEventListener('visibilitychange', () => updateVisibility(document.hidden));
      updateTheme(document.documentElement.getAttribute('data-theme'));
      hidden = document.hidden;
    }
    resize();
    frameId = requestAnimationFrame(render);
  }

  function getViewport() {
    return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 };
  }

  function startShader() {
    let canvas = document.getElementById('shader-canvas');
    if (!canvas) return;
    const getTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
    if (typeof Worker === 'undefined' || !canvas.transferControlToOffscreen) {
      initShader(canvas, getViewport(), getTheme());
      return;
    }
    let worker;
    let fellBack = false;
    const resize = () => worker.postMessage({ type: 'resize', viewport: getViewport() });
    const theme = () => worker.postMessage({ type: 'theme', theme: getTheme() });
    const visibility = () => worker.postMessage({ type: 'visibility', hidden: document.hidden });
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      if (worker) worker.terminate();
      window.removeEventListener('resize', resize);
      window.removeEventListener('themechange', theme);
      document.removeEventListener('visibilitychange', visibility);
      // A transferred canvas cannot regain its context; preserve all DOM attributes.
      const replacement = canvas.cloneNode(true);
      canvas.replaceWith(replacement);
      canvas = replacement;
      initShader(canvas, getViewport(), getTheme());
    };
    try {
      worker = new Worker('shader-bg.js');
      worker.onerror = (event) => { event.preventDefault(); fallback(); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'fallback') fallback();
        if (data.type === 'ready') { resize(); theme(); visibility(); }
      };
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: offscreen, viewport: getViewport(), theme: getTheme() }, [offscreen]);
      window.addEventListener('resize', resize);
      window.addEventListener('themechange', theme);
      document.addEventListener('visibilitychange', visibility);
    } catch (error) { fallback(); }
  }

  if (isWorker) {
    self.addEventListener('message', ({ data }) => {
      if (data.type === 'init') {
        initShader(data.canvas, data.viewport, data.theme).catch(() => self.postMessage({ type: 'fallback' }));
      }
    });
  } else {
    document.addEventListener('DOMContentLoaded', startShader);
  }
})();

