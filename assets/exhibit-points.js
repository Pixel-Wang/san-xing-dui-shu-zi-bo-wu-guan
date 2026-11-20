/* 沉浸展厅使用与实体模型共用姿态和缩放的离线表面点集。 */
const ExhibitPointCloud = (() => {
  const settings = { count: null, size: 2.48, color: '#a8d8bc', opacity: 0.98, glow: 0.18, duration: 1050 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sweep = `
    uniform vec2 sweepRange;
    uniform vec3 sweepAxis;
    float cloudThreshold(vec3 p) {
      return clamp((dot(p, sweepAxis) - sweepRange.x) / sweepRange.y, 0.0, 1.0);
    }`;
  const cache = new Map();
  let manifest;

  async function readManifest(signal) {
    if (manifest) return manifest;
    const response = await fetch('assets/point-cloud/manifest.json', {signal});
    if (!response.ok) throw Error('点云清单 HTTP ' + response.status);
    const entries = await response.json();
    signal.throwIfAborted();
    manifest = entries;
    return manifest;
  }

  async function readData(id, entry, signal) {
    if (cache.has(id)) {
      const samples = cache.get(id);
      cache.delete(id);
      cache.set(id, samples);
      return samples;
    }
    const response = await fetch('assets/point-cloud/' + id + '.bin', {signal});
    if (!response.ok) throw Error('点云文件 HTTP ' + response.status);
    const buffer = await response.arrayBuffer();
    signal.throwIfAborted();
    if (buffer.byteLength < 40) throw Error('点云文件不完整');
    const view = new DataView(buffer);
    const count = view.getUint32(4, true);
    const hash = Array.from(new Uint8Array(buffer, 8, 32), n => n.toString(16).padStart(2, '0')).join('');
    if (view.getUint32(0) !== 0x4d504331 || count !== entry.count ||
        buffer.byteLength !== 40 + 18 * count || hash !== entry.sourceSha256) throw Error('点云格式或模型版本不符');
    const samples = {
      count,
      positions: new Float32Array(buffer, 40, count * 3),
      normals: new Int8Array(buffer, 40 + count * 12, count * 3),
      colors: new Uint8Array(buffer, 40 + count * 15, count * 3)
    };
    // 仅缓存最近两件的 CPU 坐标。GPU 对象仍随展品关闭而释放。
    cache.set(id, samples);
    if (cache.size > 2) cache.delete(cache.keys().next().value);
    return samples;
  }

  async function create(model, id, signal) {
    const entries = await readManifest(signal);
    signal.throwIfAborted();
    const entry = entries[id];
    if (!entry || ![0, 2].includes(entry.axis) || !(entry.span > 0) || !Number.isFinite(entry.start)) {
      throw Error('缺少有效的展品点云清单');
    }
    if (model.root.userData.pointSourceHash && model.root.userData.pointSourceHash !== entry.sourceSha256) {
      throw Error('源 GLB 已变更，请重新生成点云');
    }
    const samples = await readData(id, entry, signal);
    signal.throwIfAborted();
    const mix = {value: 0};
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(samples.positions, 3));
    geometry.setAttribute('sampleNormal', new THREE.BufferAttribute(samples.normals, 3, true));
    geometry.setAttribute('sampleColor', new THREE.BufferAttribute(samples.colors, 3, true));
    const uniforms = {
      cloudMix: mix, pointSize: {value: 0}, tint: {value: new THREE.Color()},
      opacity: {value: 0}, glow: {value: 0},
      sweepRange: {value: new THREE.Vector2(entry.start, entry.span)},
      sweepAxis: {value: entry.axis === 2 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0)}
    };
    if (entry.axis === 2) uniforms.sweepRange.value.x = -(entry.start + entry.span);
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: true,
      vertexShader: `
        attribute vec3 sampleNormal;
        attribute vec3 sampleColor;
        uniform float pointSize;
        uniform vec3 tint;
        uniform float glow;
        varying float threshold;
        varying vec3 pointColor;
        varying float facing;
        ${sweep}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * sampleNormal);
          facing = dot(n, normalize(-v.xyz));
          vec3 keyDirection = normalize(vec3(.54, .63, .52));
          float lit = max(dot(n, keyDirection), 0.0);
          float rim = 1.0 - abs(facing);
          vec3 surface = pow(sampleColor, vec3(2.2));
          float pigment = dot(sampleColor, vec3(.30, .58, .12));
          float relief = smoothstep(.08, .85, pigment);
          vec3 patina = mix(tint, surface * 1.75, .42);
          vec3 bronze = vec3(.94, .70, .38);
          pointColor = mix(patina, bronze, .36 * lit * lit) *
            (.13 + 1.12 * lit + .16 * max(facing, 0.0)) * (.48 + relief) +
            tint * glow * (.18 + .82 * rim * rim) * (.48 + relief);
          threshold = cloudThreshold(position);
          gl_Position = projectionMatrix * v;
          gl_PointSize = clamp(pointSize * 9.8 / -v.z, 1.0, 8.0);
          #ifdef POINT_DEPTH_PASS
          // 稍大的深度点覆盖稀疏间隙。向远处偏置，保留着色点的前表面。
          gl_Position.z += .000042 * gl_Position.w;
          gl_PointSize *= 2.80;
          #endif
        }`,
      fragmentShader: `
        uniform float cloudMix;
        uniform float opacity;
        varying float threshold;
        varying vec3 pointColor;
        varying float facing;
        void main() {
          if (threshold > cloudMix) discard;
          float radius = length(gl_PointCoord - .5);
          float edge = 1.0 - smoothstep(.32, .50, radius);
          if (edge < .05) discard;
          float front = (1.0 - smoothstep(.0, .045, cloudMix - threshold)) *
                        smoothstep(.0, .07, cloudMix) * (1.0 - smoothstep(.91, 1.0, cloudMix));
          gl_FragColor = vec4(pointColor + vec3(.24,.17,.08) * front,
                              opacity * edge * mix(.065, 1.0, smoothstep(-.22, .25, facing)));
          #include <encodings_fragment>
        }`
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'exhibit-surface-points';
    points.visible = false;
    points.renderOrder = 2;
    const depthMaterial = new THREE.ShaderMaterial({
      uniforms, vertexShader: material.vertexShader, fragmentShader: material.fragmentShader,
      defines: { POINT_DEPTH_PASS: 1 }, colorWrite: false, transparent: true, depthWrite: true
    });
    const depthPoints = new THREE.Points(geometry, depthMaterial);
    depthPoints.renderOrder = 1;
    depthPoints.visible = false;
    model.oriented.add(depthPoints, points);

    const meshes = [];
    model.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const transition = original.clone();
      transition.onBeforeCompile = shader => {
        shader.uniforms.cloudMix = mix;
        shader.uniforms.sweepRange = uniforms.sweepRange;
        shader.uniforms.sweepAxis = uniforms.sweepAxis;
        shader.vertexShader = 'varying vec3 cloudPosition;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>', '#include <begin_vertex>\ncloudPosition = position;');
        shader.fragmentShader = 'uniform float cloudMix;\nvarying vec3 cloudPosition;\n' + sweep + '\n' +
          shader.fragmentShader.replace('#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\nif (cloudThreshold(cloudPosition) <= cloudMix) discard;');
      };
      meshes.push({mesh, original, transition});
    });

    let target = 0;
    let started = 0;
    let previousMix = 0;
    return {
      setMode(mode) {
        const next = Number(mode === 'cloud');
        if (target === next) return;
        target = next;
        previousMix = mix.value;
        started = performance.now();
      },
      update(pixelRatio) {
        const elapsed = performance.now() - started;
        const duration = settings.duration * Math.abs(target - previousMix);
        const t = reducedMotion.matches || !duration ? 1 : Math.min(elapsed / duration, 1);
        mix.value = previousMix + (target - previousMix) * t;
        const transitioning = mix.value > 0 && mix.value < 1;
        model.root.visible = mix.value < 1;
        points.visible = mix.value > 0;
        depthPoints.visible = points.visible;
        for (const entry of meshes) entry.mesh.material = transitioning ? entry.transition : entry.original;
        if (points.visible) {
          geometry.setDrawRange(0, THREE.MathUtils.clamp(Math.round(settings.count ?? entry.drawCount), 1, samples.count));
          uniforms.pointSize.value = settings.size * pixelRatio;
          uniforms.tint.value.set(settings.color).convertSRGBToLinear();
          uniforms.opacity.value = THREE.MathUtils.clamp(settings.opacity, 0, 1);
          uniforms.glow.value = Math.max(0, settings.glow);
        }
        return mix.value;
      },
      dispose() {
        model.root.visible = true;
        for (const entry of meshes) {
          entry.mesh.material = entry.original;
          entry.transition.dispose();
        }
        model.oriented.remove(depthPoints, points);
        geometry.dispose();
        material.dispose();
        depthMaterial.dispose();
      }
    };
  }

  return {create, settings};
})();
