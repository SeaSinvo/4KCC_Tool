/*!
 * 4KCC Engine 0.1.1
 * 作者b站SeaSinvo，使用AI工具制作
 * JS分离当前属于测试阶段，任何疑问可以在本体中提交
 * 需要加载JSZip使用
 * 可以阅读同目录下教程了解如何使用
 * 对外接口（window.__4kccEngine）：
 *   InputChart(file)
 *   PutoutLevels()
 *   InputLevel(ids?)
 *   PutoutData()
 *   InputData(meta[])
 *   Putout4kz()
 *   InputParams(params)
 *   InputGoal(goal)
 *   PutoutFile(kind='image')
 *   PutoutChart(report?)
 *   Reset()
 */
(function (global) {
  'use strict';

  var SUPPORTED_EXT = ['pez', 'mcz', 'osz', '4kz'];
  var GOALS = ['pez', 'mcz', 'osz', '4kz'];
  var DEFAULT_GOAL = 'pez';
  var PLACEHOLDER_NAME = '_placeholder.png';
  var AUDIO_EXT = /\.(mp3|ogg|wav)$/i;
  var IMAGE_EXT = /\.(jpg|jpeg|png)$/i;
  var HIT_URL = 'https://abacus.jasoncameron.dev/hit/seasinvo-github-io/chart-convert-time';
  var GET_URL = 'https://abacus.jasoncameron.dev/get/seasinvo-github-io/chart-convert-time';
  var PLACEHOLDER_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var TOOL_TEXT = '本谱面使用4KCC转换\n本工具使用AI工具编写\n作者:b站SeaSinvo\n严禁进行低创创作';
  var OFFLINE_TICKS_PER_BEAT = 32;
  var OFFLINE_K_LINE_X = 1350.0;
  var OFFLINE_K_NOTE_X = 75.0;

  var DEF_PARAMS = {
    axisN: 405,
    speed: 10,
    lineHeight: -300,
    pathCode: '',
    autoTrimAudio: false,
    useDefault: true,
    customKeynum: 4,
    manualExtreme: true,
    manualExtremeVal: 405,
    fullCapture: true,
    manualTolerance: false,
    toleranceVal: 120,
    hpDrain: 6.5,
    useOsuStarAsLevel: true
  };

  var state = null;

  function freshState() {
    return {
      loaded: false,
      sourceType: '',
      raw: [],
      detailed: {},
      selectedIds: [],
      goal: DEFAULT_GOAL,
      params: Object.assign({}, DEF_PARAMS),
      warnings: []
    };
  }


  function extOf(name) {
    var i = String(name || '').lastIndexOf('.');
    return i > 0 ? String(name).slice(i + 1).toLowerCase() : '';
  }

  function normalizeName(name) {
    var n = String(name || '').split(/[\\/]/).pop().trim();
    return n.replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  function sanitizeFileName(n) {
    return String(n || 'Untitled')
      .replace(/[^\p{L}\p{N}\-_. ]/gu, '_')
      .replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Untitled';
  }

  function noChart() {
    return { ok: false, code: 'NO_CHART', message: '未导入谱面文件' };
  }

  function pushWarning(msg) {
    if (state.warnings.indexOf(msg) === -1) state.warnings.push(msg);
  }

  function getChart(id) {
    return state.detailed[id] || state.raw.find(function (c) { return c.id === id; }) || null;
  }

  function selectedCharts() {
    var ids = state.selectedIds.length ? state.selectedIds : state.raw.map(function (c) { return c.id; });
    var out = [];
    ids.forEach(function (id) { var c = getChart(id); if (c) out.push(c); });
    return out;
  }

  function levelView(c) {
    return {
      id: c.id, title: c.title, level: c.level, keynum: c.keynum, is4K: c.keynum === 4,
      composer: c.composer, charter: c.charter, illustrator: c.illustrator,
      audioName: c.audioName, imageName: c.imageName
    };
  }

  function metaView(c) {
    return {
      id: c.id,
      title: c.title,
      level: c.level,
      composer: c.composer,
      charter: c.charter,
      illustrator: c.illustrator,
      keynum: c.keynum,
      offset: c.offset,
      bpmSegments: (c.bpmSegments || []).slice(),
      audioName: c.audioName,
      imageName: c.imageName
    };
  }


  function getExt(n) { var i = String(n || '').lastIndexOf('.'); return i > 0 ? String(n).slice(i + 1).toLowerCase() : ''; }

  function getPlaceholderBuffer() {
    var b = atob(PLACEHOLDER_BASE64);
    var bytes = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return bytes.buffer;
  }

  function cleanAssetHint(n) {
    return String(n || '').replace(/^"|"$/g, '').replace(/[​-‏‌﻿]/g, '').trim();
  }

  async function extractAssets(zip, audioHint, bgHint) {
    var entries = Object.keys(zip.files);
    var audioEntry = null, imageEntry = null;
    var cleanA = cleanAssetHint(audioHint), cleanB = cleanAssetHint(bgHint);
    for (var ei = 0; ei < entries.length; ei++) {
      var p = entries[ei]; var n = p.split('/').pop();
      if (cleanA && n === cleanA) audioEntry = zip.files[p];
      if (cleanB && n === cleanB) imageEntry = zip.files[p];
    }
    if (!audioEntry) {
      for (var ai = 0; ai < entries.length; ai++) {
        var pa = entries[ai]; var na = pa.split('/').pop();
        if (AUDIO_EXT.test(na)) { audioEntry = zip.files[pa]; break; }
      }
    }
    if (!imageEntry) {
      for (var bi = 0; bi < entries.length; bi++) {
        var pb = entries[bi]; var nb = pb.split('/').pop();
        if (IMAGE_EXT.test(nb)) { imageEntry = zip.files[pb]; break; }
      }
    }
    var audioData = null, imageData = null, audioName = '', imageName = PLACEHOLDER_NAME;
    if (audioEntry) { audioData = await audioEntry.async('arraybuffer'); audioName = audioEntry.name.split('/').pop(); }
    if (imageEntry) { imageData = await imageEntry.async('arraybuffer'); imageName = imageEntry.name.split('/').pop(); }
    else { imageData = getPlaceholderBuffer(); }
    return { audioData: audioData, imageData: imageData, audioName: audioName, imageName: imageName };
  }

  function genPathCode() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function floatToBeat(v) {
    var by = Math.round(v * 32);
    var xf = Math.floor(by / 32);
    var yf = by % 32;
    if (v < 0) xf = Math.floor(v);
    if (yf < 0) yf = 0;
    return [xf, yf, 32];
  }
  function beatToNum(b) {
    if (!b) return 0;
    var d = (b[2] || 1);
    return b[0] + b[1] / d;
  }
  function numToBeat(n) {
    var by = Math.round(n * 32);
    var xf = Math.floor(by / 32);
    var yf = by % 32;
    if (n < 0) xf = Math.floor(n);
    if (yf < 0) yf = 0;
    return [xf, yf, 32];
  }
  function beatPureMs(beatNum, bpmSegments) {
    if (!bpmSegments || bpmSegments.length === 0) return 0;
    var segIdx = 0;
    for (var si = bpmSegments.length - 1; si >= 0; si--) {
      var sb = beatToNum(bpmSegments[si].beat);
      if (sb <= beatNum + 1e-9) { segIdx = si; break; }
    }
    var seg = bpmSegments[segIdx];
    var segBeat = beatToNum(seg.beat);
    var msPerBeat = 60000 / ((seg.bpm && seg.bpm > 0) ? seg.bpm : 120);
    var cumulative = 0;
    for (var ci = 0; ci < segIdx; ci++) {
      var cur = bpmSegments[ci];
      var next = bpmSegments[ci + 1];
      var curBeat = beatToNum(cur.beat);
      var nextBeat = beatToNum(next.beat);
      var curMpb = 60000 / ((cur.bpm && cur.bpm > 0) ? cur.bpm : 120);
      cumulative += (nextBeat - curBeat) * curMpb;
    }
    return cumulative + (beatNum - segBeat) * msPerBeat;
  }

  function alignOffsetToBeat(data) {
    if (!data || !data.notes || data.notes.length === 0) return data;
    var bpmSegments = data.bpmSegments;
    if (!bpmSegments || bpmSegments.length === 0) return data;
    var offsetVal = parseFloat(data.offset) || 0;
    if (offsetVal <= 0) return data;
    var refSeg = bpmSegments[0];
    var refBpm = (refSeg.bpm && refSeg.bpm > 0) ? refSeg.bpm : 120;
    var msPerBeat = 60000 / refBpm;
    var alignBeatNum = Math.round(offsetVal / msPerBeat);
    if (alignBeatNum <= 0) return data;
    var alignMs = alignBeatNum * msPerBeat;
    var newNotes = [];
    for (var ni = 0; ni < data.notes.length; ni++) {
      var n = data.notes[ni];
      var sNum = beatToNum(n.start) + alignBeatNum;
      var eNum = n.end ? beatToNum(n.end) + alignBeatNum : sNum;
      newNotes.push({ start: numToBeat(sNum), end: numToBeat(eNum), column: n.column, type: n.type });
    }
    var newBpmSegments = bpmSegments.map(function (seg, si) {
      if (si === 0) return { beat: seg.beat, bpm: seg.bpm };
      var beatNum = beatToNum(seg.beat) + alignBeatNum;
      return { beat: numToBeat(beatNum), bpm: seg.bpm };
    });
    var newOffset = offsetVal - alignMs;
    return Object.assign({}, data, { notes: newNotes, bpmSegments: newBpmSegments, offset: newOffset });
  }

  function firstStartBeatNum(notes) {
    var min = Infinity;
    for (var i = 0; i < notes.length; i++) { var s = beatToNum(notes[i].start); if (s < min) min = s; }
    return isFinite(min) ? min : 0;
  }
  function lastTailBeatNum(notes) {
    var max = 0;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var tail = (n.type === 2 && n.end) ? beatToNum(n.end) : beatToNum(n.start);
      if (tail > max) max = tail;
    }
    return max;
  }
  function globalFirstBeatNum(dataList) {
    var min = Infinity;
    for (var i = 0; i < dataList.length; i++) {
      if (dataList[i] && dataList[i].notes) min = Math.min(min, firstStartBeatNum(dataList[i].notes));
    }
    return isFinite(min) ? min : 0;
  }
  function globalLastTailBeatNum(dataList) {
    var max = 0;
    for (var i = 0; i < dataList.length; i++) {
      if (dataList[i] && dataList[i].notes) max = Math.max(max, lastTailBeatNum(dataList[i].notes));
    }
    return max;
  }

  function autoTrimPezData(data, refFirstBeat) {
    if (!data || !data.notes || data.notes.length === 0) return data;
    var bpmSegments = data.bpmSegments;
    if (!bpmSegments || bpmSegments.length === 0) return data;
    var firstBeatNum = (typeof refFirstBeat === 'number') ? refFirstBeat : firstStartBeatNum(data.notes);
    var offsetVal = parseFloat(data.offset) || 0;
    var firstMs = beatPureMs(firstBeatNum, bpmSegments) + offsetVal;
    if (firstMs <= 4000) return data;
    var refSeg = bpmSegments[0];
    var refBpm = (refSeg.bpm && refSeg.bpm > 0) ? refSeg.bpm : 120;
    var msPerBeat = 60000 / refBpm;
    var trimBeatNum = Math.floor(4000 / msPerBeat + 1e-9);
    if (trimBeatNum < 0) trimBeatNum = 0;
    if (trimBeatNum >= firstBeatNum - 1e-9) return data;
    var deltaBeatNum = firstBeatNum - trimBeatNum;
    var trimMs = beatPureMs(trimBeatNum, bpmSegments) + offsetVal;
    var deltaMs = firstMs - trimMs;
    var newNotes = [];
    for (var ni = 0; ni < data.notes.length; ni++) {
      var n = data.notes[ni];
      var sNum = beatToNum(n.start) - deltaBeatNum;
      var eNum = n.end ? beatToNum(n.end) - deltaBeatNum : sNum;
      if (sNum < 0) sNum = 0;
      if (eNum < 0) eNum = 0;
      newNotes.push({ start: numToBeat(sNum), end: numToBeat(eNum), column: n.column, type: n.type });
    }
    var newBpmSegments = bpmSegments.map(function (seg) {
      var beatNum = beatToNum(seg.beat) - deltaBeatNum;
      if (beatNum < 0) beatNum = 0;
      return { beat: numToBeat(beatNum), bpm: seg.bpm };
    });
    var newOffset = offsetVal + deltaMs;
    return Object.assign({}, data, { notes: newNotes, bpmSegments: newBpmSegments, offset: newOffset });
  }


  function detectAudioType(name, bytes) {
    var head = bytes.subarray(0, 4);
    var h = [].slice.call(head).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    var lower = (name || '').toLowerCase();
    if (lower.endsWith('.wav') || (h.substring(0, 4) === '5249' && bytes[8] === 0x57)) return 'wav';
    if (lower.endsWith('.ogg') || (head[0] === 0x4F && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53)) return 'ogg';
    if (lower.endsWith('.mp3') || h.substring(0, 3) === '494433' || (head[0] === 0xFF && (head[1] & 0xE0) === 0xE0)) return 'mp3';
    return 'unknown';
  }

  function trimWavAudio(data, target) {
    var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (dv.getUint32(0, false) !== 0x52494646) throw new Error('不是有效的 RIFF/WAV 文件');
    var off = 12, fmt = null, dataOff = -1, dataLen = 0;
    while (off + 8 <= data.length) {
      var cid = String.fromCharCode(data[off], data[off + 1], data[off + 2], data[off + 3]);
      var csize = dv.getUint32(off + 4, true);
      var body = off + 8;
      if (cid === 'fmt ') {
        fmt = { channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
      } else if (cid === 'data') { dataOff = body; dataLen = csize; }
      off = body + csize + (csize & 1);
    }
    if (!fmt || dataOff < 0) throw new Error('WAV 中缺少 fmt/data 块');
    var frameSize = fmt.channels * fmt.bits / 8;
    var keepBytes = Math.floor(target * fmt.rate) * frameSize;
    keepBytes = Math.min(keepBytes, dataLen);
    keepBytes -= keepBytes % frameSize;
    var out = new Uint8Array((dataOff - 12) + 8 + keepBytes + 12);
    out.set(data.subarray(0, 12), 0);
    out.set(data.subarray(12, dataOff), 12);
    var odv = new DataView(out.buffer);
    odv.setUint32(4, out.length - 8, true);
    out.set([0x64, 0x61, 0x74, 0x61], dataOff);
    odv.setUint32(dataOff + 4, keepBytes, true);
    out.set(data.subarray(dataOff, dataOff + keepBytes), dataOff + 8);
    return out;
  }

  function oggCrc32(d) {
    var crc = 0;
    for (var i = 0; i < d.length; i++) {
      crc ^= d[i] << 24;
      for (var k = 0; k < 8; k++) {
        crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) : (crc << 1);
        crc >>>= 0;
      }
    }
    return crc >>> 0;
  }
  function parseOggPage(data, off) {
    if (data[off] !== 0x4F || data[off + 1] !== 0x67 || data[off + 2] !== 0x67 || data[off + 3] !== 0x53) return null;
    var nseg = data[off + 26];
    var body = 0;
    for (var i = 0; i < nseg; i++) body += data[off + 27 + i];
    var pageLen = 27 + nseg + body;
    var granule = Number(new DataView(data.buffer, data.byteOffset + off + 6, 8).getBigInt64(0, true));
    return { off: off, len: pageLen, granule: granule };
  }
  function probeOggSampleRate(bytes) {
    try {
      var off = 0;
      while (off < bytes.length) {
        var p = parseOggPage(bytes, off); if (!p) break;
        var nseg = bytes[off + 26];
        var bs = off + 27 + nseg;
        if (bytes[bs] === 1 && bytes[bs + 1] === 0x76 && bytes[bs + 2] === 0x6f) {
          return new DataView(bytes.buffer, bytes.byteOffset + bs + 12, 4).getUint32(0, true);
        }
        off += p.len;
      }
    } catch (e) { }
    return 44100;
  }
  function trimOggAudio(data, target, sampleRate) {
    var pages = [];
    var off = 0;
    while (off < data.length) {
      var p = parseOggPage(data, off);
      if (!p) break;
      pages.push(p); off += p.len;
    }
    if (!pages.length) throw new Error('OGG 中未找到有效页');
    var cutoff = Math.floor(target * sampleRate);
    var keep = [];
    for (var i = 0; i < pages.length; i++) {
      keep.push(pages[i]);
      if (pages[i].granule >= cutoff && pages[i].granule >= 0) break;
    }
    var last = keep[keep.length - 1];
    var end = last.off + last.len;
    var out = new Uint8Array(data.subarray(0, end));
    out[last.off + 5] |= 0x04;
    var page = new Uint8Array(out.subarray(last.off, end));
    var pdv = new DataView(page.buffer);
    pdv.setUint32(22, 0, true);
    var crc = oggCrc32(page);
    new DataView(out.buffer, out.byteOffset + last.off + 22).setUint32(0, crc, true);
    return out;
  }

  var MP3_BITRATES = {
    M1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    M2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
  };
  var MP3_SR = { M1: [44100, 48000, 32000], M2: [22050, 24000, 16000], M25: [11025, 12000, 8000] };
  function mp3FrameInfo(h0, h1, h2) {
    var verBits = (h1 >> 3) & 0x03;
    var layerBits = (h1 >> 1) & 0x03;
    if (verBits === 1 || layerBits === 0) return null;
    var ver = verBits === 3 ? 'M1' : verBits === 2 ? 'M2' : 'M25';
    var layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
    var brIdx = (h2 >> 4) & 0x0F, srIdx = (h2 >> 2) & 0x03, pad = (h2 >> 1) & 0x01;
    var brTab = MP3_BITRATES[ver === 'M1' ? 'M1' : 'M2'];
    var br = brTab[brIdx] * 1000;
    if (br === 0 || srIdx === 3) return null;
    var sr = MP3_SR[ver][srIdx];
    var samples = layer === 1 ? 384 : 1152;
    var frameLen;
    if (layer === 1) frameLen = (4 * Math.floor(samples * br / sr / 32) + pad) * 4;
    else frameLen = Math.floor(samples * br / 8 / sr) + pad;
    return { frameLen: frameLen, dur: samples / sr, sr: sr, layer: layer };
  }
  function skipId3(data) {
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
      var sz = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F);
      return 10 + sz;
    }
    return 0;
  }
  function findBytesIn(data, str) {
    var pat = [].map.call(str, function (c) { return c.charCodeAt(0); });
    for (var i = 0; i <= data.length - pat.length; i++) {
      var j;
      for (j = 0; j < pat.length; j++) if (data[i + j] !== pat[j]) break;
      if (j === pat.length) return i;
    }
    return -1;
  }
  function trimMp3Audio(data, target) {
    var off = skipId3(data);
    var frames = []; var t = 0;
    while (off + 4 <= data.length) {
      if (data[off] === 0xFF && (data[off + 1] & 0xE0) === 0xE0) {
        var info = mp3FrameInfo(data[off], data[off + 1], data[off + 2]);
        if (info) {
          if (off + info.frameLen > data.length) break;
          frames.push({ off: off, frameLen: info.frameLen, dur: info.dur, t: t });
          t += info.dur; off += info.frameLen; continue;
        }
      }
      off++;
    }
    if (!frames.length) throw new Error('MP3 中未解析出有效帧');
    var keepEnd = data.length;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].t > target) { keepEnd = frames[i].off; break; }
    }
    var kept = frames.filter(function (f) { return f.off < keepEnd; });
    var out = new Uint8Array(data.subarray(0, keepEnd));
    var tags = ['Xing', 'Info'];
    for (var ti = 0; ti < tags.length; ti++) {
      var idx = findBytesIn(out, tags[ti]);
      if (idx < 8) continue;
      var flags = new DataView(out.buffer, out.byteOffset + idx + 4, 4).getUint32(0, false);
      var p = idx + 8;
      if (flags & 1) { new DataView(out.buffer, out.byteOffset + p, 4).setUint32(0, kept.length, false); p += 4; }
      if (flags & 2) { new DataView(out.buffer, out.byteOffset + p, 4).setUint32(0, keepEnd - 10, false); }
      break;
    }
    return out;
  }

  function trimTrailingAudio(data, refTailBeat) {
    if (!data || !data.audioData || !data.notes || data.notes.length === 0) return data;
    if (!data.bpmSegments || data.bpmSegments.length === 0) return data;

    var tailBeat = (typeof refTailBeat === 'number') ? refTailBeat : lastTailBeatNum(data.notes);
    var offsetVal = parseFloat(data.offset) || 0;
    var tailMs = beatPureMs(tailBeat, data.bpmSegments) + offsetVal;
    var keepMs = tailMs + 4000;
    var targetSec = keepMs / 1000;

    var src = data.audioData;
    var bytes = (src instanceof ArrayBuffer) ? new Uint8Array(src) :
                (src.slice ? new Uint8Array(src) : new Uint8Array(src.buffer, src.byteOffset, src.byteLength));

    var type = detectAudioType(data.audioName || '', bytes);
    if (type === 'unknown') return data;

    try {
      var out;
      if (type === 'wav') out = trimWavAudio(bytes, targetSec);
      else if (type === 'mp3') out = trimMp3Audio(bytes, targetSec);
      else if (type === 'ogg') {
        var sr = probeOggSampleRate(bytes);
        out = trimOggAudio(bytes, targetSec, sr);
      } else return data;

      if (!out || out.length === 0 || out.length >= bytes.length) return data;

      return Object.assign({}, data, {
        audioData: out.buffer.slice(out.byteOffset, out.byteOffset + out.length),
        duration: targetSec
      });
    } catch (e) {
      return data;
    }
  }

  function stripStarSuffix(level) {
    return String(level || '').replace(/\s*\[★[\d.]+\]\s*$/, '');
  }

  function osuXOf(K, i) {
    if (K <= 0) K = 4;
    return Math.floor(512 / K * (i + 0.5));
  }
  function pezXOf(K, i, N) {
    if (K <= 1) return 0;
    return (i / (K - 1) * 2 - 1) * N;
  }
  function axisNForKeynum(K) {
    K = parseInt(K, 10);
    if (isNaN(K) || K <= 1) return 405;
    return Math.round(675 * (K - 1) / (K + 1) * 100) / 100;
  }

  function parseYml(str) {
    var obj = {};
    var lines = String(str || '').split('\n');
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (line.trim() === '' || line.startsWith('#')) continue;
      var idx = line.indexOf(':');
      if (idx === -1) continue;
      var key = line.slice(0, idx).trim();
      var val = line.slice(idx + 1).trim();
      if (val.startsWith('-')) {
        var arr = []; var i = li;
        while (i < lines.length && lines[i].trim().startsWith('-')) { arr.push(lines[i].trim().slice(1).trim()); i++; }
        obj[key] = arr; continue;
      }
      if (val === '|' || val === '|-') { obj[key] = ''; continue; }
      obj[key] = val;
    }
    return obj;
  }

  function detectAudioType(name, bytes) {
    var head = bytes.subarray(0, 4);
    var h = [].slice.call(head).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    var lower = (name || '').toLowerCase();
    if (lower.endsWith('.wav') || (h.substring(0, 4) === '5249' && bytes[8] === 0x57)) return 'wav';
    if (lower.endsWith('.ogg') || (head[0] === 0x4F && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53)) return 'ogg';
    if (lower.endsWith('.mp3') || h.substring(0, 3) === '494433' || (head[0] === 0xFF && (head[1] & 0xE0) === 0xE0)) return 'mp3';
    return 'unknown';
  }


  var calcOsuStarRaw = (function () {
    var INDIV_DECAY = 0.125, OVER_DECAY = 0.3, DECAY_WEIGHT = 0.9, SECTION = 400, DIFF_MULT = 0.018;
    var pow = Math.pow;
    function applyDecay(v, dt, base) { return v * pow(base, dt / 1000.0); }
    function rte(x) {
      var f = Math.floor(x), d = x - f;
      if (d > 0.5) return f + 1;
      if (d < 0.5) return f;
      return f % 2 === 0 ? f : f + 1;
    }
    function osuLegacySort(arr, cmp) {
      function swap(i, j) { if (i !== j) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } }
      function swapIfGreater(a, b) { if (a !== b && cmp(arr[a], arr[b]) > 0) swap(a, b); }
      function downHeap(i, n, lo) {
        while (i <= Math.floor(n / 2)) {
          var child = 2 * i;
          if (child < n && cmp(arr[lo + child - 1], arr[lo + child]) < 0) child += 1;
          if (cmp(arr[lo + i - 1], arr[lo + child - 1]) >= 0) break;
          swap(lo + i - 1, lo + child - 1); i = child;
        }
      }
      function heapSort(lo, hi) {
        var n = hi - lo + 1;
        for (var i = Math.floor(n / 2); i >= 1; i--) downHeap(i, n, lo);
        for (var i = n; i >= 2; i--) { swap(lo, lo + i - 1); downHeap(1, i - 1, lo); }
      }
      function quick(left, right, depth) {
        while (true) {
          if (depth === 0) { heapSort(left, right); return; }
          var i = left, j = right;
          var middle = i + ((j - i) >> 1);
          swapIfGreater(i, middle); swapIfGreater(i, j); swapIfGreater(middle, j);
          while (true) {
            while (cmp(arr[i], arr[middle]) < 0) i += 1;
            while (cmp(arr[middle], arr[j]) < 0) j -= 1;
            if (i < j) swap(i, j);
            else if (i === j) { }
            else break;
            i += 1; j = j > 0 ? j - 1 : 0;
            if (i > j) break;
          }
          depth -= 1;
          if (Math.max(0, j - left) <= right - i) { if (left < j) quick(left, j, depth); left = i; }
          else { if (i < right) quick(i, right, depth); right = j; }
          if (left >= right) break;
        }
      }
      if (arr.length >= 2) quick(0, arr.length - 1, 32);
    }
    function calcStars(objs, cs) {
      var nObjects = objs.length;
      if (!nObjects) return null;
      var total = Math.max(1, rte(cs));
      var objects = objs.slice();
      osuLegacySort(objects, function (a, b) { return rte(a.start) - rte(b.start); });
      var divisor = 512 / total;
      for (var oi = 0; oi < objects.length; oi++) {
        var o = objects[oi];
        o.col = Math.min(Math.floor(o.x / divisor), total - 1);
        if (o.col < 0) o.col = 0;
      }
      var maxCombo = 0, nHold = 0;
      for (var oi2 = 0; oi2 < objects.length; oi2++) {
        maxCombo += 1;
        var dur = objects[oi2].end - objects[oi2].start;
        if (dur > 0) { maxCombo += Math.trunc(dur / 100); nHold += 1; }
      }
      if (nObjects < 2) return { stars: 0 };
      var individual = new Array(total).fill(0);
      var highest = 0, overall = 1.0, current = 0;
      var sectionPeak = 0, sectionEnd = 0;
      var peaks = [];
      var perColLastStart = new Array(total).fill(null);
      var prevHit = new Array(total).fill(null);
      function evalIndividual(c, prev) {
        var bonus = false;
        for (var pi = 0; pi < prev.length; pi++) {
          var p = prev[pi];
          if (p && p.end > c.end + 1.0 && c.start > p.start + 1.0) { bonus = true; break; }
        }
        return 2.0 * (bonus ? 1.25 : 1.0);
      }
      function evalOverall(c, prev) {
        var start = c.start, end = c.end;
        var overlapping = false;
        var closest = Math.abs(end - start);
        var holdFactor = 1.0, holdAdd = 0.0;
        for (var pi2 = 0; pi2 < prev.length; pi2++) {
          var p = prev[pi2];
          if (!p) continue;
          if (p.end > start + 1.0 && end > p.end + 1.0 && start > p.start + 1.0) overlapping = true;
          if (p.end > end + 1.0 && start > p.start + 1.0) holdFactor = 1.25;
          var d = Math.abs(end - p.end);
          if (d < closest) closest = d;
        }
        if (overlapping) holdAdd = 1.0 / (1.0 + Math.exp(0.27 * (30.0 - closest)));
        return (1.0 + holdAdd) * holdFactor;
      }
      for (var i = 1; i < objects.length; i++) {
        var curr = objects[i];
        var prev = objects[i - 1];
        var idx = i - 1;
        var col = curr.col;
        var start = curr.start;
        var deltaTime = start - prev.start;
        if (idx > 0) prevHit[prev.col] = prev;
        var prevInCol = perColLastStart[col];
        var colStrainTime = prevInCol === null ? 0 : (start - prevInCol);
        if (idx === 0) sectionEnd = Math.ceil(start / SECTION) * SECTION;
        while (start > sectionEnd) {
          peaks.push(sectionPeak);
          var prevStart = idx === 0 ? 0.0 : prev.start;
          sectionPeak = applyDecay(highest, sectionEnd - prevStart, INDIV_DECAY)
                     + applyDecay(overall, sectionEnd - prevStart, OVER_DECAY);
          sectionEnd += SECTION;
        }
        individual[col] = applyDecay(individual[col], colStrainTime, INDIV_DECAY);
        individual[col] += evalIndividual(curr, prevHit);
        highest = deltaTime <= 1.0 ? Math.max(highest, individual[col]) : individual[col];
        overall = applyDecay(overall, deltaTime, OVER_DECAY);
        overall += evalOverall(curr, prevHit);
        var c = current * pow(1.0, deltaTime / 1000.0);
        var sv = (highest + overall) - c;
        current = c + sv * 1.0;
        var strain = current;
        if (strain > sectionPeak) sectionPeak = strain;
        perColLastStart[col] = start;
      }
      peaks.push(sectionPeak);
      var filt = peaks.filter(function (p) { return p > 0.0; });
      filt.sort(function (a, b) { return b - a; });
      var diff = 0, w = 1.0;
      for (var fi = 0; fi < filt.length; fi++) { diff += filt[fi] * w; w *= DECAY_WEIGHT; }
      return { stars: diff * DIFF_MULT };
    }
    function formatStars(res) {
      if (!res || typeof res.stars !== 'number' || !isFinite(res.stars)) return null;
      var raw = res.stars;
      if (raw < 0 || raw > 100) return null;
      var neg = raw < 0;
      var floored = Math.floor(Math.abs(raw) * 100) / 100;
      return (neg ? '-' : '') + floored.toFixed(2);
    }
    return function (objs, cs) {
      try {
        if (!objs || objs.length === 0) return null;
        return formatStars(calcStars(objs, cs));
      } catch (e) { return null; }
    };
  })();

  function buildStarInputFromInternal(dataList, index) {
    var d0 = dataList[0];
    var bpmSegments = d0.bpmSegments.map(function (s) { return { beat: s.beat.slice(), bpm: (s.bpm && s.bpm > 0) ? s.bpm : 120 }; });
    var offset = parseFloat(d0.offset) || 0;
    var sp = 0;
    for (var i = 0; i < bpmSegments.length; i++) {
      if (i === 0) { bpmSegments[i].sp = 0; }
      else {
        var prevBeat = bpmSegments[i - 1].beat[0] + bpmSegments[i - 1].beat[1] / (bpmSegments[i - 1].beat[2] || 1);
        var curBeat = bpmSegments[i].beat[0] + bpmSegments[i].beat[1] / (bpmSegments[i].beat[2] || 1);
        var msPerBeat = 60000 / bpmSegments[i - 1].bpm;
        sp += (curBeat - prevBeat) * msPerBeat;
        bpmSegments[i].sp = sp;
      }
    }
    function beatToMs(beatArr) {
      var beat = beatArr[0] + beatArr[1] / (beatArr[2] || 1);
      var idx = -1;
      for (var bi = bpmSegments.length - 1; bi >= 0; bi--) {
        var segBeat = bpmSegments[bi].beat[0] + bpmSegments[bi].beat[1] / (bpmSegments[bi].beat[2] || 1);
        if (segBeat <= beat + 1e-9) { idx = bi; break; }
      }
      if (idx === -1) idx = 0;
      var seg = bpmSegments[idx];
      var segBeat = seg.beat[0] + seg.beat[1] / (seg.beat[2] || 1);
      var msPerBeat = 60000 / seg.bpm;
      var pureMs = seg.sp + (beat - segBeat) * msPerBeat;
      return pureMs + offset;
    }
    var data = dataList[index];
    var kn = data.keynum || 4;
    if (kn <= 0) kn = 4;
    var objs = [];
    for (var ni = 0; ni < data.notes.length; ni++) {
      var n = data.notes[ni];
      if (n.column >= kn) continue;
      var startMs = beatToMs(n.start);
      var x = osuXOf(kn, n.column);
      var endMs = startMs;
      if (n.type === 2) endMs = beatToMs(n.end);
      objs.push({ x: x, start: startMs, end: endMs });
    }
    return { objs: objs, cs: kn };
  }

  function applyOsuStarToDataList(dataList, useFlag) {
    if (!useFlag || !dataList || dataList.length === 0) return;
    for (var di = 0; di < dataList.length; di++) {
      var d = dataList[di];
      if (!d || !d.notes || !d.bpmSegments) continue;
      try {
        var input = buildStarInputFromInternal(dataList, di);
        if (!input || !input.objs || input.objs.length === 0) continue;
        var star = calcOsuStarRaw(input.objs, input.cs);
        if (typeof star === 'string' && star.length > 0) {
          var orig = stripStarSuffix(d.level || '');
          d.level = orig + '[★' + star + ']';
        }
      } catch (e) {  }
    }
  }


  function cleanAssetName(n) {
    return String(n || '').split('/').pop().replace(/^"|"$/g, '').trim();
  }

  function pezZipData(data, pathCode, axisN, speedVal, lineHeight, targetZip) {
    var offsetVal = Math.round(parseFloat(data.offset) || 0);
    if (isNaN(lineHeight)) lineHeight = -300;
    var bpmSegments = data.bpmSegments;
    var kn = data.keynum || 4;
    if (kn <= 0) kn = 4;
    var notesArray = [];
    for (var ni = 0; ni < data.notes.length; ni++) {
      var n = data.notes[ni];
      if (n.column >= kn) continue;
      notesArray.push({
        above: 1, alpha: 255, endTime: n.end, isFake: 0,
        positionX: pezXOf(kn, n.column, axisN), size: 1, speed: 1,
        startTime: n.start, type: n.type, visibleTime: 999999, yOffset: 0
      });
    }
    var bpmList = bpmSegments.map(function (seg) {
      var bpm = (seg.bpm && seg.bpm > 0) ? seg.bpm : 120;
      return { startTime: seg.beat || [0, 0, 1], bpm: bpm };
    });
    var outAudioName = cleanAssetName(data.audioName);
    var outImgName = cleanAssetName(data.imageName);
    if (data.audioData && !outAudioName) outAudioName = 'audio.mp3';
    if (data.imageData && !outImgName) outImgName = 'bg.jpg';

    var chartJson = {
      BPMList: bpmList,
      META: {
        RPEVersion: 160, background: outImgName, charter: data.charter || '',
        composer: data.composer || '', duration: parseFloat(data.duration) || 0,
        id: data.title || 'Untitled', illustration: data.illustrator || 'UK',
        level: data.level || '4K', name: data.title || 'Untitled',
        offset: offsetVal, song: outAudioName
      },
      chartTime: 0, judgeLineGroup: ['Default'],
      judgeLineList: [{
        Group: 0, Name: 'main', Texture: 'line.png',
        alphaControl: [{ alpha: 1, easing: 1, x: 0 }, { alpha: 1, easing: 1, x: 9999999 }],
        anchor: [0.5, 0.5], bpmfactor: 1,
        eventLayers: [{
          alphaEvents: [{ bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: 1, end: 255, endTime: [1, 0, 1], linkgroup: 0, start: 255, startTime: [0, 0, 1] }],
          moveXEvents: [{ bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: 1, end: 0, endTime: [1, 0, 1], linkgroup: 0, start: 0, startTime: [0, 0, 1] }],
          moveYEvents: [{ bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: 1, end: lineHeight, endTime: [1, 0, 1], linkgroup: 0, start: lineHeight, startTime: [0, 0, 1] }],
          rotateEvents: [{ bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: 1, end: 0, endTime: [1, 0, 1], linkgroup: 0, start: 0, startTime: [0, 0, 1] }],
          speedEvents: [{ end: speedVal, endTime: [1, 0, 1], linkgroup: 0, start: speedVal, startTime: [0, 0, 1] }]
        }],
        extended: { inclineEvents: [{ bezier: 0, bezierPoints: [0, 0, 0, 0], easingLeft: 0, easingRight: 1, easingType: 1, end: 0, endTime: [1, 0, 1], linkgroup: 0, start: 0, startTime: [0, 0, 1] }] },
        father: -1, isCover: 0, isGif: false,
        notes: notesArray, numOfNotes: notesArray.length,
        posControl: [{ easing: 1, pos: 1, x: 0 }, { easing: 1, pos: 1, x: 9999999 }],
        sizeControl: [{ easing: 1, size: 1, x: 0 }, { easing: 1, size: 1, x: 9999999 }],
        skewControl: [{ easing: 1, skew: 0, x: 0 }, { easing: 1, skew: 0, x: 9999999 }],
        yControl: [{ easing: 1, x: 0, y: 1 }, { easing: 1, x: 9999999, y: 1 }],
        zOrder: 0
      }],
      multiLineString: '', multiScale: 1
    };

    var infoLines = [
      '#', 'Name: ' + (data.title || 'Untitled'), 'Path: ' + pathCode,
      'Song: ' + outAudioName, 'Picture: ' + outImgName,
      'Chart: chart.json', 'Level: ' + (data.level || '4K'),
      'Composer: ' + (data.composer || ''), 'Charter: ' + (data.charter || ''),
      'Illustrator: ' + (data.illustrator || 'UK'),
      'Length: ' + ((parseFloat(data.duration) || 0).toFixed(3)),
      'Keynum: ' + kn
    ];
    var zip = targetZip || new global.JSZip();
    zip.file('info.txt', infoLines.join('\n'));
    zip.file('chart.json', JSON.stringify(chartJson, null, 3));
    zip.file('Tool.txt', TOOL_TEXT);
    if (data.audioData) zip.file(outAudioName, data.audioData);
    if (data.imageData) zip.file(outImgName, data.imageData);
    return zip;
  }

  async function buildPezPackage(dataList, params) {
    var pathCodeBase = (params.pathCode || '').trim() || genPathCode();
    var speedVal = parseFloat(params.speed) || 10;
    var lineHeight = parseFloat(params.lineHeight);
    if (isNaN(lineHeight)) lineHeight = -300;
    var fixedAxis = params.manualExtreme ? parseFloat(params.manualExtremeVal) : null;
    if (isNaN(fixedAxis)) fixedAxis = null;
    var autoTrim = !!params.autoTrimAudio;

    var globalFirst = globalFirstBeatNum(dataList);
    var globalTail = globalLastTailBeatNum(dataList);
    var preparedList = [];
    for (var di = 0; di < dataList.length; di++) {
      var d = alignOffsetToBeat(dataList[di]);
      if (autoTrim) {
        d = autoTrimPezData(d, globalFirst);
        d = trimTrailingAudio(d, globalTail);
      }
      preparedList.push(d);
    }

    var isMulti = preparedList.length > 1;
    var d0 = preparedList[0];
    var baseName = sanitizeFileName(d0.title || 'Untitled');

    if (!isMulti) {
      var kn = parseInt(preparedList[0].keynum, 10) || 4;
      var axisN = fixedAxis !== null ? fixedAxis : axisNForKeynum(kn);
      var zip = pezZipData(preparedList[0], pathCodeBase, axisN, speedVal, lineHeight);
      var blob = await zip.generateAsync({ type: 'blob' });
      var filename = sanitizeFileName((d0.title || 'Untitled') + ' ' + (d0.level || '4K')) + '.pez';
      return { blob: blob, filename: filename };
    }

    var outer = new global.JSZip();
    for (var i = 0; i < preparedList.length; i++) {
      var pData = preparedList[i];
      var pKn = parseInt(pData.keynum, 10) || 4;
      var pAxis = fixedAxis !== null ? fixedAxis : axisNForKeynum(pKn);
      var pPathCode = pathCodeBase + (i + 1);
      var pZip = pezZipData(pData, pPathCode, pAxis, speedVal, lineHeight);
      var pBytes = await pZip.generateAsync({ type: 'uint8array' });
      outer.file(sanitizeFileName((pData.title || 'Untitled') + ' ' + (pData.level || '4K')) + '.pez', pBytes);
    }
    var blobMulti = await outer.generateAsync({ type: 'blob' });
    return { blob: blobMulti, filename: baseName + '.zip' };
  }

  async function buildMczPackage(dataList, params) {
    var d0 = dataList[0];
    var mczOffset = -(parseFloat(d0.offset) || 0);
    var bpmSegments = d0.bpmSegments;
    var isMulti = dataList.length > 1;
    var zip = new global.JSZip();
    zip.file('Tool.txt', TOOL_TEXT);

    for (var di = 0; di < dataList.length; di++) {
      var data = dataList[di];
      var kn = data.keynum || 4;
      if (kn <= 0) kn = 4;
      var mcJson = {
        meta: {
          $ver: 0, creator: data.charter || '', background: d0.background || '',
          version: data.level || '4K', id: 0, mode: 0,
          time: Math.floor(Date.now() / 1000),
          song: { title: d0.title || 'Untitled', artist: d0.composer || '', id: 0 },
          mode_ext: { column: kn, bar_begin: 0 }
        },
        time: bpmSegments.map(function (seg) {
          var bpm = (seg.bpm && seg.bpm > 0) ? seg.bpm : 120;
          return { beat: seg.beat || [0, 0, 1], bpm: bpm };
        }),
        effect: [], note: [],
        extra: { test: { divide: 4, speed: 100, save: 0, lock: 0, edit_mode: 0 } }
      };
      for (var ni = 0; ni < data.notes.length; ni++) {
        var n = data.notes[ni];
        if (n.column >= kn) continue;
        var note = { beat: n.start, column: n.column };
        if (n.type === 2) note.endbeat = n.end;
        mcJson.note.push(note);
      }
      mcJson.note.push({ beat: [0, 0, 1], sound: d0.audio || '', vol: 100, offset: mczOffset, type: 1 });
      var mcName = isMulti ? ('chart' + (di + 1) + '.mc') : 'chart.mc';
      zip.file(mcName, JSON.stringify(mcJson, null, 2));
    }
    if (d0.audioData && d0.audioName) zip.file(cleanAssetName(d0.audioName), d0.audioData);
    if (d0.imageData && d0.imageName) zip.file(cleanAssetName(d0.imageName), d0.imageData);

    var blob = await zip.generateAsync({ type: 'blob' });
    var baseName = sanitizeFileName(d0.title || 'Untitled');
    var filename = isMulti ? (baseName + '.mcz') : (baseName + ' ' + (d0.level || '4K') + '.mcz');
    return { blob: blob, filename: filename };
  }

  async function buildOszPackage(dataList, params) {
    var d0 = dataList[0];
    var bpmSegments = d0.bpmSegments.map(function (s) {
      return { beat: s.beat.slice(), bpm: (s.bpm && s.bpm > 0) ? s.bpm : 120 };
    });
    var offset = parseFloat(d0.offset) || 0;
    var hpDrain = parseFloat(params.hpDrain) || 6.5;
    var isMulti = dataList.length > 1;

    var sp = 0;
    for (var i = 0; i < bpmSegments.length; i++) {
      if (i === 0) { bpmSegments[i].sp = 0; }
      else {
        var prevBeat = bpmSegments[i - 1].beat[0] + bpmSegments[i - 1].beat[1] / (bpmSegments[i - 1].beat[2] || 1);
        var curBeat = bpmSegments[i].beat[0] + bpmSegments[i].beat[1] / (bpmSegments[i].beat[2] || 1);
        var msPerBeat = 60000 / bpmSegments[i - 1].bpm;
        sp += (curBeat - prevBeat) * msPerBeat;
        bpmSegments[i].sp = sp;
      }
    }

    var timingLines = [];
    var cumulativeTime = offset;
    for (var si = 0; si < bpmSegments.length; si++) {
      var seg = bpmSegments[si];
      var beat = seg.beat[0] + seg.beat[1] / (seg.beat[2] || 1);
      var msPerBeat = 60000 / seg.bpm;
      timingLines.push(cumulativeTime + ',' + msPerBeat + ',4,3,1,40,1,0');
      if (si < bpmSegments.length - 1) {
        var nextSeg = bpmSegments[si + 1];
        var nextBeat = nextSeg.beat[0] + nextSeg.beat[1] / (nextSeg.beat[2] || 1);
        var deltaBeats = nextBeat - beat;
        cumulativeTime += deltaBeats * msPerBeat;
      }
    }

    var zip = new global.JSZip();
    var bgExt = getExt(d0.imageName) || 'jpg';
    var audioExt = getExt(d0.audioName) || 'ogg';

    for (var di = 0; di < dataList.length; di++) {
      var data = dataList[di];
      var kn = data.keynum || 4;
      if (kn <= 0) kn = 4;
      var hitObjects = [];
      for (var ni = 0; ni < data.notes.length; ni++) {
        var n = data.notes[ni];
        if (n.column >= kn) continue;
        var startBeat = n.start[0] + n.start[1] / (n.start[2] || 1);
        var idx = -1;
        for (var bi = bpmSegments.length - 1; bi >= 0; bi--) {
          var segBeat = bpmSegments[bi].beat[0] + bpmSegments[bi].beat[1] / (bpmSegments[bi].beat[2] || 1);
          if (segBeat <= startBeat + 1e-9) { idx = bi; break; }
        }
        if (idx === -1) idx = 0;
        var seg = bpmSegments[idx];
        var segBeat = seg.beat[0] + seg.beat[1] / (seg.beat[2] || 1);
        var segSp = seg.sp;
        var msPerBeat = 60000 / seg.bpm;
        var pureMs = segSp + (startBeat - segBeat) * msPerBeat;
        var timeMs = Math.round(pureMs + offset);
        var x = osuXOf(kn, n.column);
        if (n.type === 1) {
          hitObjects.push(x + ',192,' + timeMs + ',1,0,0:0:0:0');
        } else if (n.type === 2) {
          var endBeat = n.end[0] + n.end[1] / (n.end[2] || 1);
          var idxEnd = -1;
          for (var bj = bpmSegments.length - 1; bj >= 0; bj--) {
            var segBeatEnd = bpmSegments[bj].beat[0] + bpmSegments[bj].beat[1] / (bpmSegments[bj].beat[2] || 1);
            if (segBeatEnd <= endBeat + 1e-9) { idxEnd = bj; break; }
          }
          if (idxEnd === -1) idxEnd = 0;
          var segEnd = bpmSegments[idxEnd];
          var segBeatEnd2 = segEnd.beat[0] + segEnd.beat[1] / (segEnd.beat[2] || 1);
          var msPerBeatEnd = 60000 / segEnd.bpm;
          var pureEndMs = segEnd.sp + (endBeat - segBeatEnd2) * msPerBeatEnd;
          var endMs = Math.round(pureEndMs + offset);
          hitObjects.push(x + ',192,' + timeMs + ',128,0,' + endMs + ':0:0:0');
        }
      }
      var osuContent = [
        'osu file format v14', '',
        '[General]', 'AudioFilename: audio.' + audioExt, 'Mode: 3', 'PreviewTime: 0', 'StackLeniency: 0.7', '',
        '[Metadata]', 'Title: ' + (d0.title || 'Untitled'),
        'Artist: ' + (d0.composer || 'Unknown'), 'Creator: ' + (data.charter || 'Unknown'),
        'Version: ' + (data.level || '4K'), '',
        '[Difficulty]', 'CircleSize: ' + kn, 'HPDrainRate: ' + hpDrain,
        'OverallDifficulty: 6.5', 'ApproachRate: 5', 'SliderMultiplier: 1.4', '',
        '[Events]', '0,0,"bg.' + bgExt + '",0,0', '',
        '[TimingPoints]'
      ].concat(timingLines, [''], '[HitObjects]', hitObjects).join('\n');
      var osuName = isMulti ? ('chart' + (di + 1) + '.osu') : 'chart.osu';
      zip.file(osuName, osuContent);
    }
    if (d0.audioData) zip.file('audio.' + audioExt, d0.audioData);
    if (d0.imageData) zip.file('bg.' + bgExt, d0.imageData);
    else zip.file('bg.png', getPlaceholderBuffer());
    zip.file('Tool.txt', TOOL_TEXT);

    var blob = await zip.generateAsync({ type: 'blob' });
    var baseName = sanitizeFileName(d0.title || 'Untitled');
    var filename = isMulti ? (baseName + '.osz') : (baseName + ' ' + (d0.level || '4K') + '.osz');
    return { blob: blob, filename: filename };
  }

  async function build4kzPackage(dataList, params) {
    var d0 = dataList[0];
    var audioExt = d0.audioName ? getExt(d0.audioName) : 'ogg';
    var imgExt = d0.imageName ? getExt(d0.imageName) : 'png';
    var isMulti = dataList.length > 1;
    var zip = new global.JSZip();
    zip.file('Tool.txt', TOOL_TEXT);

    var levelField, charterField;
    if (isMulti) {
      levelField = JSON.stringify(dataList.map(function (d) { return d.level || '4K'; }));
      charterField = JSON.stringify(dataList.map(function (d) { return d.charter || 'Unknown'; }));
    } else {
      levelField = d0.level || '4K';
      charterField = d0.charter || 'Unknown';
    }
    var keynumField = JSON.stringify(dataList.map(function (d) { return d.keynum || 4; }));

    var fLines = [
      'title: ' + (d0.title || 'Untitled'),
      'level: ' + levelField,
      'composer: ' + (d0.composer || 'Unknown'),
      'charter: ' + charterField,
      'illustrator: ' + (d0.illustrator || 'UK'),
      'audio: audio.' + audioExt,
      'background: bg.' + imgExt,
      'duration: ' + (d0.duration || 0),
      'bpmSegments: ' + JSON.stringify(d0.bpmSegments),
      'offset: ' + (d0.offset || 0),
      'keynum: ' + keynumField
    ];
    zip.file('Tmp-F.txt', fLines.join('\n'));

    if (isMulti) {
      for (var i = 0; i < dataList.length; i++) {
        zip.file('Tmp-T' + (i + 1) + '.txt', notesToTmpT(dataList[i].notes, dataList[i].keynum));
      }
    } else {
      zip.file('Tmp-T.txt', notesToTmpT(dataList[0].notes, dataList[0].keynum));
    }
    if (d0.audioData) zip.file('audio.' + audioExt, d0.audioData);
    if (d0.imageData) zip.file('bg.' + imgExt, d0.imageData);
    else zip.file('bg.png', getPlaceholderBuffer());

    var blob = await zip.generateAsync({ type: 'blob' });
    var baseName = sanitizeFileName(d0.title || 'Untitled');
    var filename = isMulti ? (baseName + '.4kz') : (baseName + ' ' + (d0.level || '4K') + '.4kz');
    return { blob: blob, filename: filename };
  }

  async function buildPackage(charts, goal, params) {
    if (goal === 'pez') return await buildPezPackage(charts, params);
    if (goal === 'mcz') return await buildMczPackage(charts, params);
    if (goal === 'osz') return await buildOszPackage(charts, params);
    if (goal === '4kz') return await build4kzPackage(charts, params);
    return { blob: null, filename: '' };
  }


  function serializeTmpF(charts) {
    var d0 = charts[0];
    var isMulti = charts.length > 1;
    var levelField = isMulti ? JSON.stringify(charts.map(function (c) { return c.level || '4K'; })) : (d0.level || '4K');
    var charterField = isMulti ? JSON.stringify(charts.map(function (c) { return c.charter || 'Unknown'; })) : (d0.charter || 'Unknown');
    var audioExt = d0.audioName ? getExt(d0.audioName) : 'ogg';
    var imgExt = d0.imageName ? getExt(d0.imageName) : 'png';
    return [
      'title: ' + (d0.title || 'Untitled'),
      'level: ' + levelField,
      'composer: ' + (d0.composer || 'Unknown'),
      'charter: ' + charterField,
      'illustrator: ' + (d0.illustrator || 'UK'),
      'audio: audio.' + audioExt,
      'background: bg.' + imgExt,
      'duration: ' + (d0.duration || 0),
      'bpmSegments: ' + JSON.stringify(d0.bpmSegments),
      'offset: ' + (d0.offset || 0),
      'keynum: ' + JSON.stringify(charts.map(function (c) { return c.keynum || 4; }))
    ].join('\n');
  }

  function notesToTmpT(notes, keynum) {
    var kn = keynum || 4;
    if (kn <= 0) kn = 4;
    var out = [];
    for (var i = 0; i < (notes || []).length; i++) {
      var n = notes[i];
      if (n.column >= kn) continue;
      var s = n.start.join(',');
      var e = n.end.join(',');
      out.push(s + '-' + e + '-' + n.column + '-' + n.type);
    }
    return out.join('\n');
  }


  function parseTmpF(tmpF) {
    var lines = String(tmpF || '').trim().split('\n').filter(function (l) { return l.trim(); });
    var data = {};
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var idx = line.indexOf(':');
      if (idx === -1) continue;
      var key = line.slice(0, idx).trim();
      var val = line.slice(idx + 1).trim();
      if (key === 'bpmSegments' || key === 'charter' || key === 'level' || key === 'keynum') {
        try { data[key] = JSON.parse(val); } catch (e) { data[key] = val; }
      } else {
        data[key] = val;
      }
    }
    return data;
  }

  function parseTmpT(tmpT) {
    var lines = String(tmpT || '').trim().split('\n').filter(function (l) { return l.trim(); });
    return lines.map(function (line) {
      var parts = line.split('-');
      if (parts.length !== 4) return null;
      var start = parts[0].split(',').map(Number);
      var end = parts[1].split(',').map(Number);
      start = start.map(function (v) { return isNaN(v) ? 0 : v; });
      end = end.map(function (v) { return isNaN(v) ? 0 : v; });
      var col = parseInt(parts[2], 10);
      var type = parseInt(parts[3], 10);
      if (isNaN(col) || isNaN(type)) return null;
      return { start: start, end: end, column: col, type: type };
    }).filter(function (n) { return n !== null; });
  }

  async function scan4KZ(zip) {
    var files = zip.files;
    var tmpFContent = null;
    var tmpTEntries = [];
    var audioData = null, imageData = null;
    var audioName = '', imageName = '';
    for (var path in files) {
      var file = files[path];
      if (file.dir) continue;
      var name = path.split('/').pop();
      if (name === 'Tmp-F.txt') tmpFContent = await file.async('string');
      else if (/^Tmp-T\d*\.txt$/.test(name)) tmpTEntries.push({ name: name, content: await file.async('string') });
      else if (name.startsWith('audio.')) { audioData = await file.async('arraybuffer'); audioName = name; }
      else if (name.startsWith('bg.')) { imageData = await file.async('arraybuffer'); imageName = name; }
    }
    if (!tmpFContent || tmpTEntries.length === 0) {
      return { list: [], failures: [{ file: 'Tmp-F/Tmp-T', reason: 'missing_meta' }] };
    }
    tmpTEntries.sort(function (a, b) {
      function rank(n) {
        if (n === 'Tmp-T.txt') return 0;
        var m = n.match(/^Tmp-T(\d+)\.txt$/);
        return m ? parseInt(m[1], 10) : 9999;
      }
      return rank(a.name) - rank(b.name);
    });
    var meta = parseTmpF(tmpFContent);
    if (!meta.bpmSegments || meta.bpmSegments.length === 0) {
      return { list: [], failures: [{ file: 'Tmp-F.txt', reason: 'missing_meta' }] };
    }
    var list = [];
    var failures = [];
    for (var i = 0; i < tmpTEntries.length; i++) {
      var lv = meta.level;
      var ch = meta.charter;
      var kn = meta.keynum;
      if (Array.isArray(lv)) lv = lv[i] !== undefined ? lv[i] : (lv[0] || '4K');
      if (Array.isArray(ch)) ch = ch[i] !== undefined ? ch[i] : (ch[0] || 'Unknown');
      if (Array.isArray(kn)) kn = kn[i] !== undefined ? kn[i] : 4;
      else if (kn === undefined || kn === null || kn === '') kn = 4;
      kn = parseInt(kn, 10);
      if (isNaN(kn) || kn <= 0) { failures.push({ file: tmpTEntries[i].name, reason: 'missing_meta' }); continue; }
      list.push({
        type: '4kz',
        title: meta.title || 'Untitled',
        level: (typeof lv === 'string' ? lv : (Array.isArray(lv) ? lv[0] : '4K')) || '4K',
        composer: meta.composer || 'Unknown',
        charter: (typeof ch === 'string' ? ch : (Array.isArray(ch) ? ch[0] : 'Unknown')) || 'Unknown',
        illustrator: meta.illustrator || 'UK',
        audio: meta.audio || '', background: meta.background || '',
        duration: parseFloat(meta.duration) || 0,
        bpmSegments: meta.bpmSegments, hasMultipleBPM: meta.bpmSegments.length > 1,
        offset: parseFloat(meta.offset) || 0,
        notes: [], audioData: audioData, imageData: imageData,
        audioName: audioName, imageName: imageName,
        keynum: kn, is4K: kn === 4,
        _ref: { kind: '4kz', tmpTText: tmpTEntries[i].content }
      });
    }
    return { list: list, failures: failures };
  }

  function finalize4kz(raw) {
    var notes = parseTmpT(raw._ref.tmpTText);
    return Object.assign({}, raw, { notes: notes });
  }


  async function scanMCZ(zip) {
    var entries = Object.keys(zip.files).filter(function (p) { var e = zip.files[p]; if (e.dir) return false; var n = p.split('/').pop(); return n && n.length > 0 && n.endsWith('.mc'); });
    var charts = [];
    var failures = [];
    for (var pi = 0; pi < entries.length; pi++) {
      var p = entries[pi];
      try {
        var e = zip.files[p]; var c = await e.async('string'); var j = JSON.parse(c);
        var m = j.meta || {}; var mode = m.mode; var col = m.mode_ext && m.mode_ext.column;
        if (mode !== 0) { failures.push({ file: p, reason: 'not_mania' }); continue; }
        var kn = 4;
        if (typeof col === 'number' && isFinite(col) && col > 0) kn = Math.floor(col);
        else if (typeof col === 'string' && col.length > 0) { var pn = parseInt(col, 10); if (!isNaN(pn) && pn > 0) kn = pn; }
        if (kn <= 0) { failures.push({ file: p, reason: 'missing_meta' }); continue; }
        var song = m.song || {};
        var notesRaw = j.note || [];
        var audioHint = '', mczOffset = 0;
        for (var ni = 0; ni < notesRaw.length; ni++) { var n = notesRaw[ni]; if (n.sound) { audioHint = n.sound; mczOffset = n.offset || 0; break; } }
        var assets = await extractAssets(zip, audioHint, m.background);
        var time = j.time || [];
        var bpmSegments = time.map(function (t) { var bpm = (t.bpm && t.bpm > 0) ? t.bpm : 120; return { beat: t.beat || [0, 0, 1], bpm: bpm }; });
        charts.push({
          type: 'mcz', title: song.title || 'Untitled', level: m.version || '4K',
          composer: song.artist || 'Unknown', charter: m.creator || 'Unknown', illustrator: 'UK',
          audio: assets.audioName, background: assets.imageName, duration: 0,
          bpmSegments: bpmSegments, hasMultipleBPM: bpmSegments.length > 1, offset: -mczOffset,
          notes: [], audioData: assets.audioData, imageData: assets.imageData,
          audioName: assets.audioName, imageName: assets.imageName,
          keynum: kn, is4K: kn === 4,
          _ref: { kind: 'mcz', json: j, keynum: kn }
        });
      } catch (err) { failures.push({ file: p, reason: 'json_parse' }); }
    }
    return { charts: charts, failures: failures };
  }

  function finalizeMCZ(raw) {
    var mcJson = raw._ref.json; var notesRaw = mcJson.note || [];
    var noteData = [];
    for (var ni2 = 0; ni2 < notesRaw.length; ni2++) {
      var n2 = notesRaw[ni2]; if (n2.sound) continue; if (n2.column === undefined) continue;
      var start = n2.beat || [0, 0, 1]; var end = n2.endbeat || start; var col = n2.column;
      var isHold = (n2.endbeat !== undefined) && (n2.endbeat.join(',') !== n2.beat.join(','));
      var type = isHold ? 2 : 1;
      noteData.push({ start: start, end: end, column: col, type: type });
    }
    return Object.assign({}, raw, { notes: noteData, mcJson: mcJson });
  }


  async function scanOSZ(zip) {
    var entries = Object.keys(zip.files).filter(function (p) { var e = zip.files[p]; if (e.dir) return false; var n = p.split('/').pop(); return n && n.length > 0 && n.endsWith('.osu'); });
    var charts = [];
    var failures = [];
    for (var pi = 0; pi < entries.length; pi++) {
      var p = entries[pi];
      try {
        var e = zip.files[p]; var c = await e.async('string');
        c = c.replace(/^\uFEFF/, '');
        var mm = c.match(/\[General\][\s\S]*?Mode:\s*(\d+)/i);
        var cs = c.match(/\[Difficulty\][\s\S]*?CircleSize:\s*([\d.]+)/i);
        var mode = mm ? parseInt(mm[1]) : -1;
        if (mode !== 3) { failures.push({ file: p, reason: 'not_mania' }); continue; }
        var kn = 4;
        if (cs) { var pn = Math.round(parseFloat(cs[1])); if (!isNaN(pn) && pn > 0) kn = pn; }
        if (kn <= 0) { failures.push({ file: p, reason: 'missing_meta' }); continue; }
        var metadata = c.match(/\[Metadata\][\s\S]*?(?=\n\[[A-Z])/i);
        var title = '', artist = '', creator = '', version = '';
        if (metadata) {
          var t = metadata[0].match(/Title:\s*([^\n\r]+)/i);
          var a = metadata[0].match(/Artist:\s*([^\n\r]+)/i);
          var cr = metadata[0].match(/Creator:\s*([^\n\r]+)/i);
          var v = metadata[0].match(/Version:\s*([^\n\r]+)/i);
          if (t) title = t[1].trim(); if (a) artist = a[1].trim(); if (cr) creator = cr[1].trim(); if (v) version = v[1].trim();
        }
        var am = c.match(/AudioFilename:\s*([^\r\n]+)/i);
        var audioHint = am && am[1] ? am[1].replace(/[​-‏‌﻿]/g, '').replace(/^"|"$/g, '').trim() : '';
        var events = c.match(/\[Events\][\s\S]*?(?=\n\[[A-Z])/i);
        var bgHint = '';
        if (events) { var bm = events[0].match(/0,0,"([^"]+\.(?:jpg|png|jpeg))"/i); if (bm) bgHint = bm[1].trim(); }
        var assets = await extractAssets(zip, audioHint, bgHint);
        charts.push({
          type: 'osz', title: title || 'Untitled', level: version || '4K',
          composer: artist || 'Unknown', charter: creator || 'Unknown', illustrator: 'UK',
          audio: assets.audioName, background: assets.imageName, duration: 0,
          bpmSegments: [], hasMultipleBPM: false, offset: 0,
          notes: [], audioData: assets.audioData, imageData: assets.imageData,
          audioName: assets.audioName, imageName: assets.imageName,
          keynum: kn, is4K: kn === 4,
          _ref: { kind: 'osz', content: c, keynum: kn }
        });
      } catch (err) { failures.push({ file: p, reason: 'read_error' }); }
    }
    return { charts: charts, failures: failures };
  }

  function finalizeOSZ(raw) {
    var content = raw._ref.content;
    var timingPoints = content.match(/\[TimingPoints\][\s\S]*?(?=\n\[[A-Z])/i);
    var hitObjects = content.match(/\[HitObjects\][\s\S]*/i);
    var bpmSegments = [];
    if (timingPoints) {
      var lines = timingPoints[0].split('\n').filter(function (l) { return l.trim() && !l.trim().startsWith('//'); });
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li]; var parts = line.trim().split(',');
        if (parts.length < 2) continue;
        var value = parseFloat(parts[1]);
        if (value > 0) {
          var bpm = Math.round((60000 / value) * 100) / 100;
          var offset = parseFloat(parts[0]) || 0;
          bpmSegments.push({ time: offset, msPerBeat: value, bpm: bpm });
        }
      }
    }
    if (bpmSegments.length === 0) return null;
    bpmSegments.sort(function (a, b) { return a.time - b.time; });
    var fmss = bpmSegments[0].time;
    var sp = 0; var prevTime = bpmSegments[0].time; var prevMsb = bpmSegments[0].msPerBeat;
    for (var i = 1; i < bpmSegments.length; i++) {
      var seg = bpmSegments[i];
      sp += (seg.time - prevTime) / prevMsb;
      seg.sp = sp; prevTime = seg.time; prevMsb = seg.msPerBeat;
    }
    bpmSegments[0].sp = 0;
    var notes = []; var xValues = [];
    if (hitObjects) {
      var lines2 = hitObjects[0].split('\n').filter(function (l) { return l.trim() && !l.trim().startsWith('//'); });
      for (var li2 = 0; li2 < lines2.length; li2++) {
        var line2 = lines2[li2]; var parts2 = line2.split(',');
        if (parts2.length < 4) continue;
        var x = parseInt(parts2[0]); var time2 = parseInt(parts2[2]); var type2 = parseInt(parts2[3]);
        if (isNaN(x) || isNaN(time2) || (type2 !== 1 && type2 !== 128)) continue;
        var endTime = time2;
        if (type2 === 128 && parts2.length >= 6) {
          var extras = parts2.slice(5).join(',');
          var em = extras.match(/^(\d+):/);
          if (em) endTime = parseInt(em[1], 10);
        }
        xValues.push(x);
        notes.push({ x: x, time: time2, type: type2, endTime: endTime });
      }
    }
    var uniqueX = Array.from(new Set(xValues)).sort(function (a, b) { return a - b; });
    var xMap = {}; uniqueX.forEach(function (x, idx) { xMap[x] = idx; });
    var noteData = [];
    for (var ni = 0; ni < notes.length; ni++) {
      var n = notes[ni]; var segment = null;
      for (var si = bpmSegments.length - 1; si >= 0; si--) { if (n.time >= bpmSegments[si].time) { segment = bpmSegments[si]; break; } }
      if (!segment) segment = bpmSegments[0];
      var mss = segment.time; var msb = segment.msPerBeat; var spVal = segment.sp;
      var relBeat = (n.time - mss) / msb; var absBeat = relBeat + spVal;
      var startBeat = floatToBeat(absBeat); var endBeat = startBeat;
      if (n.type === 128) {
        var endSegment = null;
        for (var si2 = bpmSegments.length - 1; si2 >= 0; si2--) { if (n.endTime >= bpmSegments[si2].time) { endSegment = bpmSegments[si2]; break; } }
        if (!endSegment) endSegment = bpmSegments[0];
        var eMss = endSegment.time; var eMsb = endSegment.msPerBeat; var eSp = endSegment.sp;
        var eRel = (n.endTime - eMss) / eMsb; var eAbs = eRel + eSp;
        endBeat = floatToBeat(eAbs);
      }
      var col = xMap[n.x] !== undefined ? xMap[n.x] : 0;
      var typeVal = n.type === 128 ? 2 : 1;
      noteData.push({ start: startBeat, end: endBeat, column: col, type: typeVal });
    }
    var bpmSegmentsForExport = bpmSegments.map(function (seg) { return { beat: floatToBeat(seg.sp), bpm: seg.bpm, time: seg.time }; });
    return Object.assign({}, raw, {
      bpmSegments: bpmSegmentsForExport, hasMultipleBPM: bpmSegmentsForExport.length > 1, offset: fmss,
      notes: noteData, osuContent: content, firstOffset: fmss
    });
  }


  var OFFLINE_TICKS_PER_BEAT = 32;
  var OFFLINE_K_LINE_X = 1350.0;
  var OFFLINE_K_NOTE_X = 75.0;

  function _officialGcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  function _officialTickToRpeTime(tick) {
    var num = Math.trunc(tick);
    var den = OFFLINE_TICKS_PER_BEAT;
    var g = _officialGcd(num, den);
    num = num / g; den = den / g;
    if (den === 1) return [num, 0, 1];
    var x = Math.trunc(num / den);
    var y = num - x * den;
    return [x, y, den];
  }

  function _officialConvertMoveX(events) {
    var out = [];
    events = events || [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var sVal = (Number(e.start) - 0.5) * OFFLINE_K_LINE_X;
      var eVal = (Number(e.end) - 0.5) * OFFLINE_K_LINE_X;
      out.push({
        startTime: _officialTickToRpeTime(Number(e.startTime)),
        endTime: _officialTickToRpeTime(Number(e.endTime)),
        start: sVal, end: eVal, easingType: 1
      });
    }
    if (out.length === 0) {
      out.push({ startTime: [0, 0, 1], endTime: [1, 0, 1], start: 0, end: 0, easingType: 1 });
    }
    return out;
  }

  function _officialConvertSpeed(events) {
    var out = [];
    events = events || [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var v = Number(e.value);
      out.push({
        startTime: _officialTickToRpeTime(Number(e.startTime)),
        endTime: _officialTickToRpeTime(Number(e.endTime)),
        start: v, end: v, easingType: 1
      });
    }
    if (out.length === 0) {
      out.push({ startTime: [0, 0, 1], endTime: [1, 0, 1], start: 1, end: 1, easingType: 1 });
    }
    return out;
  }

  function _officialConvertRotate(events) {
    var out = [];
    events = events || [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var sVal = Number(e.start);
      if (isNaN(sVal)) sVal = 0;
      var eVal = (e.end !== undefined && e.end !== null) ? Number(e.end) : sVal;
      if (isNaN(eVal)) eVal = sVal;
      out.push({
        startTime: _officialTickToRpeTime(Number(e.startTime)),
        endTime: _officialTickToRpeTime(Number(e.endTime)),
        start: sVal, end: eVal, easingType: 1
      });
    }
    if (out.length === 0) {
      out.push({ startTime: [0, 0, 1], endTime: [1, 0, 1], start: 0, end: 0, easingType: 1 });
    }
    return out;
  }

  function _officialConvertNote(n) {
    var phiType = parseInt(n.type, 10);
    if (phiType === 2 || phiType === 4) return null;
    var tick = Number(n.time || 0);
    var hold = n.holdTime;
    if (hold === null || hold === undefined) hold = 0;
    hold = Number(hold);
    var posX = Number(n.positionX || 0);
    var rpeType, startTick, endTick;
    if (phiType === 3) { rpeType = 2; startTick = tick; endTick = tick + hold; }
    else { rpeType = 1; startTick = tick; endTick = tick; }
    return {
      above: 1, alpha: 255, endTime: _officialTickToRpeTime(endTick), isFake: 0,
      positionX: Math.round(posX * OFFLINE_K_NOTE_X * 10000) / 10000, size: 1.0, speed: 1.0,
      startTime: _officialTickToRpeTime(startTick), type: rpeType, visibleTime: 999999.0, yOffset: 0.0
    };
  }

  function officialChartRestore(chartJson) {
    var bpmList = chartJson.BPMList || [];
    if (bpmList.length > 0) return null;
    var lines = chartJson.judgeLineList || [];
    if (lines.length === 0) return null;
    var bpms = [];
    for (var i = 0; i < lines.length; i++) {
      var b = lines[i] ? lines[i].bpm : undefined;
      if (typeof b !== 'number' || isNaN(b) || b <= 0) throw new Error('PEZ 谱面缺少 BPM 信息');
      bpms.push(b);
    }
    var mn = Math.min.apply(null, bpms);
    var mx = Math.max.apply(null, bpms);
    if (mx - mn >= 0.5) return null;
    var avg = 0;
    for (var j = 0; j < bpms.length; j++) avg += bpms[j];
    avg = avg / bpms.length;
    var stdBpm = Math.round(avg * 1000) / 1000;
    var rpeLines = [];
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li];
      var notes = [];
      var above = L.notesAbove || [];
      for (var ai = 0; ai < above.length; ai++) { var n1 = _officialConvertNote(above[ai]); if (n1) notes.push(n1); }
      var below = L.notesBelow || [];
      for (var bi = 0; bi < below.length; bi++) { var n2 = _officialConvertNote(below[bi]); if (n2) notes.push(n2); }
      notes.sort(function (a, b) {
        var at = a.startTime, bt = b.startTime;
        return (at[0] + at[1] / at[2]) - (bt[0] + bt[1] / bt[2]);
      });
      var rpeLine = {
        Group: 0, Name: 'line_' + li, Texture: 'line.png',
        alphaControl: [{ alpha: 1, easing: 1, x: 0 }, { alpha: 1, easing: 1, x: 9999999 }],
        bpmfactor: 1,
        eventLayers: [{
          moveXEvents: _officialConvertMoveX(L.judgeLineMoveEvents),
          speedEvents: _officialConvertSpeed(L.speedEvents),
          rotateEvents: _officialConvertRotate(L.judgeLineRotateEvents)
        }],
        extended: {}, father: -1, isCover: 0, notes: notes, numOfNotes: notes.length,
        posControl: [{ easing: 1, pos: 1, x: 0 }, { easing: 1, pos: 1, x: 9999999 }],
        skewControl: [{ easing: 1, skew: 0, x: 0 }, { easing: 1, skew: 0, x: 9999999 }],
        yControl: [{ easing: 1, x: 0, y: 1 }, { easing: 1, x: 9999999, y: 1 }],
        zOrder: 0
      };
      rpeLines.push(rpeLine);
    }
    var topOffset = chartJson.offset;
    var metaOffset = 0;
    if (typeof topOffset === 'number' && !isNaN(topOffset)) metaOffset = Math.trunc(topOffset);
    else if (typeof topOffset === 'string' && topOffset !== '') {
      var parsed = parseFloat(topOffset);
      if (!isNaN(parsed)) metaOffset = Math.trunc(parsed);
    }
    return {
      BPMList: [{ startTime: [0, 0, 1], bpm: stdBpm }],
      META: { offset: metaOffset }, judgeLineGroup: ['Default'],
      judgeLineList: rpeLines, multiLineString: '', multiScale: 1
    };
  }

  async function scanPEZ(zip) {
    var entries = Object.keys(zip.files).filter(function (p) { var e = zip.files[p]; if (e.dir) return false; var n = p.split('/').pop(); return n && n.length > 0; });
    var infoYml = null, infoTxt = null, chartJson = null;
    for (var ei = 0; ei < entries.length; ei++) {
      var p = entries[ei]; var n = p.split('/').pop(); var e = zip.files[p];
      if (n === 'info.yml') { var c = await e.async('string'); infoYml = parseYml(c); }
      else if (n === 'info.txt') { infoTxt = await e.async('string'); }
    }
    var chartFileName = '';
    if (infoYml && infoYml.chart) chartFileName = infoYml.chart;
    else if (infoTxt) {
      var lines = infoTxt.split('\n');
      for (var li = 0; li < lines.length; li++) { var line = lines[li]; if (line.startsWith('Chart:')) { chartFileName = line.replace('Chart:', '').trim(); break; } }
    }
    var chartEntry = null;
    if (chartFileName) {
      for (var ei2 = 0; ei2 < entries.length; ei2++) { var p2 = entries[ei2]; var n2 = p2.split('/').pop(); if (n2 === chartFileName) { chartEntry = zip.files[p2]; break; } }
    }
    if (!chartEntry) {
      for (var ei3 = 0; ei3 < entries.length; ei3++) {
        var p3 = entries[ei3]; var n3 = p3.split('/').pop();
        if (!n3.endsWith('.json') || n3 === 'extra.json') continue;
        var e2 = zip.files[p3]; var c2 = await e2.async('string');
        if (c2.includes('"judgeLineList"')) { chartEntry = e2; chartFileName = n3; break; }
      }
    }
    if (!chartEntry) throw new Error('未找到有效谱面 JSON 文件');
    var chartContent = await chartEntry.async('string');
    chartJson = JSON.parse(chartContent);

    try {
      var restored = officialChartRestore(chartJson);
      if (restored) chartJson = restored;
    } catch (e) { throw e; }

    var meta = chartJson.META || {};
    var bpmList = chartJson.BPMList || [];
    var bpmSegments, hasMultipleBPM;
    if (bpmList.length > 0) {
      bpmSegments = bpmList.map(function (b) { var bpm = (b.bpm && b.bpm > 0) ? b.bpm : 120; return { beat: b.startTime || [0, 0, 1], bpm: bpm }; });
      hasMultipleBPM = bpmSegments.length > 1;
    } else { return null; }

    var title = '', level = '', composer = '', charter = '', illustrator = '', audioFile = '', bgFile = '';
    var duration = 0, pezOffset = 0;
    if (infoTxt) {
      var tlines = infoTxt.split('\n');
      for (var ti = 0; ti < tlines.length; ti++) {
        var tl = tlines[ti];
        if (tl.startsWith('Name:')) title = title || tl.replace('Name:', '').trim();
        if (tl.startsWith('Level:')) level = level || tl.replace('Level:', '').trim();
        if (tl.startsWith('Composer:')) composer = composer || tl.replace('Composer:', '').trim();
        if (tl.startsWith('Charter:')) charter = charter || tl.replace('Charter:', '').trim();
        if (tl.startsWith('Illustrator:')) illustrator = illustrator || tl.replace('Illustrator:', '').trim();
        if (tl.startsWith('Song:')) audioFile = audioFile || tl.replace('Song:', '').trim();
        if (tl.startsWith('Picture:')) bgFile = bgFile || tl.replace('Picture:', '').trim();
      }
    }
    if (infoYml) {
      title = title || infoYml.name || '';
      level = level || infoYml.level || infoYml.difficulty || '';
      composer = composer || infoYml.composer || '';
      charter = charter || infoYml.charter || '';
      illustrator = illustrator || infoYml.illustrator || '';
      audioFile = audioFile || infoYml.music || '';
      bgFile = bgFile || infoYml.illustration || '';
    }
    pezOffset = meta.offset || 0;
    title = cleanAssetHint(title) || 'Untitled'; level = cleanAssetHint(level) || '4K';
    composer = cleanAssetHint(composer) || 'Unknown'; charter = cleanAssetHint(charter) || 'Unknown';
    illustrator = cleanAssetHint(illustrator) || 'UK';

    var assets = await extractAssets(zip, audioFile, bgFile);
    return {
      type: 'pez', title: title, level: level,
      composer: composer, charter: charter, illustrator: illustrator,
      audio: assets.audioName, background: assets.imageName,
      duration: duration, bpmSegments: bpmSegments, hasMultipleBPM: hasMultipleBPM,
      offset: pezOffset,
      notes: [], audioData: assets.audioData, imageData: assets.imageData,
      audioName: assets.audioName, imageName: assets.imageName,
      keynum: 4, is4K: true,
      _ref: { kind: 'pez', chartJson: chartJson }
    };
  }

  function finalizePEZ(raw) {
    var p = state.params;
    var tolerance = p.manualTolerance ? p.toleranceVal : 120;
    var useManual = p.manualExtreme && p.manualExtremeVal > 0;
    var manualN = useManual ? p.manualExtremeVal : 0;
    var fullCapture = p.fullCapture;
    var customK = p.customKeynum;
    var chartJson = raw._ref.chartJson;
    try {
      var restored = officialChartRestore(chartJson);
      if (restored) chartJson = restored;
    } catch (err) { return null; }

    var judgeLines = chartJson.judgeLineList || [];
    var allNotes = [];
    var lineInfos = [];
    for (var jli = 0; jli < judgeLines.length; jli++) {
      var line = judgeLines[jli];
      var lineNotes = line.notes || [];
      var speedEvents = [];
      var eventLayers = line.eventLayers || [];
      for (var eli = 0; eli < eventLayers.length; eli++) { var layer = eventLayers[eli]; if (layer && layer.speedEvents && layer.speedEvents.length) speedEvents = speedEvents.concat(layer.speedEvents); }
      speedEvents.sort(function (a, b) { var sa = a.startTime || [0, 0, 1]; var sb = b.startTime || [0, 0, 1]; return sa[0] + sa[1] / sa[2] - (sb[0] + sb[1] / sb[2]); });
      var speedRanges = [];
      for (var si = 0; si < speedEvents.length; si++) {
        var ev = speedEvents[si];
        var start = ev.startTime || [0, 0, 1];
        var end = (si + 1 < speedEvents.length) ? speedEvents[si + 1].startTime : [9999, 0, 1];
        var startBeat = start[0] + start[1] / start[2];
        var endBeat = end[0] + end[1] / end[2];
        speedRanges.push({ start: startBeat, end: endBeat, speed: ev.start });
      }
      if (speedRanges.length === 0) speedRanges.push({ start: -Infinity, end: Infinity, speed: 10 });
      var moveXEvents = [];
      for (var eli2 = 0; eli2 < eventLayers.length; eli2++) { var layer2 = eventLayers[eli2]; if (layer2 && layer2.moveXEvents && layer2.moveXEvents.length) moveXEvents = moveXEvents.concat(layer2.moveXEvents); }
      moveXEvents.sort(function (a, b) { var sa = a.startTime || [0, 0, 1]; var sb = b.startTime || [0, 0, 1]; return (sa[0] + sa[1] / sa[2]) - (sb[0] + sb[1] / sb[2]); });
      var moveRanges = [];
      for (var mi = 0; mi < moveXEvents.length; mi++) {
        var ev2 = moveXEvents[mi];
        var start2 = ev2.startTime || [0, 0, 1];
        var end2 = ev2.endTime;
        if (!end2 || (end2[0] === 0 && end2[1] === 0 && end2[2] === 0)) end2 = (mi + 1 < moveXEvents.length) ? moveXEvents[mi + 1].startTime : [9999, 0, 1];
        var startBeat2 = start2[0] + start2[1] / start2[2];
        var endBeat2 = end2[0] + end2[1] / end2[2];
        var startVal = ev2.start || 0;
        var endVal = (ev2.end !== undefined && ev2.end !== null) ? ev2.end : ((mi + 1 < moveXEvents.length) ? (moveXEvents[mi + 1].start || 0) : 0);
        moveRanges.push({ start: startBeat2, end: endBeat2, startVal: startVal, endVal: endVal });
      }
      var rotateEvents = [];
      for (var eli3 = 0; eli3 < eventLayers.length; eli3++) { var layer3 = eventLayers[eli3]; if (layer3 && layer3.rotateEvents && layer3.rotateEvents.length) rotateEvents = rotateEvents.concat(layer3.rotateEvents); }
      rotateEvents.sort(function (a, b) { var sa = a.startTime || [0, 0, 1]; var sb = b.startTime || [0, 0, 1]; return (sa[0] + sa[1] / sa[2]) - (sb[0] + sb[1] / sb[2]); });
      var rotateRanges = [];
      for (var ri = 0; ri < rotateEvents.length; ri++) {
        var ev3 = rotateEvents[ri];
        var start3r = ev3.startTime || [0, 0, 1];
        var end3r = ev3.endTime;
        if (!end3r || (end3r[0] === 0 && end3r[1] === 0 && end3r[2] === 0)) end3r = (ri + 1 < rotateEvents.length) ? rotateEvents[ri + 1].startTime : [9999, 0, 1];
        var startBeat3r = start3r[0] + start3r[1] / start3r[2];
        var endBeat3r = end3r[0] + end3r[1] / end3r[2];
        var startAngle = (ev3.start !== undefined && ev3.start !== null) ? Number(ev3.start) : 0;
        var endAngle = (ev3.end !== undefined && ev3.end !== null) ? Number(ev3.end) : ((ri + 1 < rotateEvents.length) ? Number(rotateEvents[ri + 1].start || 0) : 0);
        rotateRanges.push({ start: startBeat3r, end: endBeat3r, startAngle: startAngle, endAngle: endAngle });
      }
      for (var ni = 0; ni < lineNotes.length; ni++) {
        var n = lineNotes[ni];
        if (n.type !== 1 && n.type !== 2) continue;
        var posX = n.positionX || 0;
        var start3 = n.startTime || [0, 0, 1];
        var end3 = n.endTime || start3;
        var startBeat3 = start3[0] + start3[1] / start3[2];
        var speedZero = false;
        var curSpeed = 10;
        for (var ri2 = 0; ri2 < speedRanges.length; ri2++) { var range = speedRanges[ri2]; if (startBeat3 > range.start && startBeat3 <= range.end) { curSpeed = range.speed; break; } }
        if (curSpeed === 0) speedZero = true;
        if (n.speed !== undefined && n.speed !== null && Number(n.speed) === 0) speedZero = true;
        allNotes.push({ start: start3, end: end3, startBeat: startBeat3, positionX: posX, type: n.type, speedZero: speedZero, lineIndex: lineInfos.length, rawNote: n });
      }
      lineInfos.push({ moveRanges: moveRanges, rotateRanges: rotateRanges });
    }
    if (allNotes.length === 0) return null;

    var sortedBase;
    var targetK = parseInt(customK, 10);
    if (isNaN(targetK) || targetK < 1) targetK = 4;
    if (targetK > 10) targetK = 10;
    var useManualFinal = useManual && manualN > 0;
    if (useManualFinal) {
      var N = manualN;
      sortedBase = [];
      for (var bi = 0; bi < targetK; bi++) { sortedBase.push(targetK === 1 ? 0 : -N + 2 * N * bi / (targetK - 1)); }
    } else {
      var freq = {};
      for (var ni = 0; ni < allNotes.length; ni++) { var n = allNotes[ni]; if (n.speedZero) continue; var x = n.positionX; freq[x] = (freq[x] || 0) + 1; }
      var sortedX = Object.keys(freq).map(Number).sort(function (a, b) { return freq[b] - freq[a]; });
      var baseXList = sortedX.slice(0, targetK);
      if (baseXList.length < targetK) return null;
      sortedBase = baseXList.slice().sort(function (a, b) { return a - b; });
    }

    function getXLForNote(note) {
      var lineInfo = lineInfos[note.lineIndex];
      var moveRanges2 = lineInfo.moveRanges;
      if (moveRanges2.length === 0) return 0;
      var t = note.startBeat;
      var EPS = 1e-9;
      for (var ri2 = 0; ri2 < moveRanges2.length; ri2++) {
        var range2 = moveRanges2[ri2];
        if (t + EPS >= range2.start && t - EPS <= range2.end) {
          if (Math.abs(t - range2.end) <= EPS) return range2.endVal;
          var dur = range2.end - range2.start;
          if (Math.abs(dur) <= EPS) return range2.startVal;
          var progress = (t - range2.start) / dur;
          return range2.startVal + progress * (range2.endVal - range2.startVal);
        }
      }
      var first = moveRanges2[0];
      var last = moveRanges2[moveRanges2.length - 1];
      if (t <= first.start + EPS) return first.startVal;
      if (t >= last.end - EPS) return last.endVal;
      return 0;
    }

    function getAngleForNote(note) {
      var lineInfo = lineInfos[note.lineIndex];
      var rotateRanges2 = lineInfo.rotateRanges || [];
      if (rotateRanges2.length === 0) return 0;
      var t = note.startBeat;
      var EPS = 1e-9;
      for (var ri2 = 0; ri2 < rotateRanges2.length; ri2++) {
        var range2 = rotateRanges2[ri2];
        if (t + EPS >= range2.start && t - EPS <= range2.end) {
          if (Math.abs(t - range2.end) <= EPS) return range2.endAngle;
          var dur = range2.end - range2.start;
          if (Math.abs(dur) <= EPS) return range2.startAngle;
          var progress = (t - range2.start) / dur;
          return range2.startAngle + progress * (range2.endAngle - range2.startAngle);
        }
      }
      var first = rotateRanges2[0];
      var last = rotateRanges2[rotateRanges2.length - 1];
      if (t <= first.start + EPS) return first.startAngle;
      if (t >= last.end - EPS) return last.endAngle;
      return 0;
    }

    function normAngle(a) { a = a % 360; if (a < 0) a += 360; return a; }
    function shouldFlipByAngle(note) { var ang = normAngle(getAngleForNote(note)); return ang >= 135 && ang <= 225; }
    function composeAbsX(note, lineX) { if (shouldFlipByAngle(note)) return lineX - note.positionX; return lineX + note.positionX; }

    var occupied = [];
    function isConflict(col, startBeat, endBeat) {
      for (var oi = 0; oi < occupied.length; oi++) { var occ = occupied[oi]; if (occ.col !== col) continue; if (startBeat <= occ.endBeat && endBeat >= occ.startBeat) return true; }
      return false;
    }
    function addOccupied(col, startBeat, endBeat) { occupied.push({ col: col, startBeat: startBeat, endBeat: endBeat }); }

    function tryAssignNote(note, absX) {
      var candidates = [];
      for (var col = 0; col < sortedBase.length; col++) { var diff = Math.abs(absX - sortedBase[col]); if (diff <= tolerance) candidates.push({ col: col, diff: diff, base: sortedBase[col] }); }
      candidates.sort(function (a, b) { if (a.diff !== b.diff) return a.diff - b.diff; return b.base - a.base; });
      var startBeat = note.startBeat;
      var endBeat = (note.type === 2) ? (note.end[0] + note.end[1] / note.end[2]) : startBeat;
      for (var ci = 0; ci < candidates.length; ci++) {
        var col = candidates[ci].col;
        if (!isConflict(col, startBeat, endBeat)) { var assignedNote = Object.assign({}, note, { column: col }); addOccupied(col, startBeat, endBeat); return assignedNote; }
      }
      return null;
    }

    function assignNoteByDistance(note, absX) {
      var candidates = [];
      for (var col = 0; col < sortedBase.length; col++) { var dist = Math.abs(absX - sortedBase[col]); candidates.push({ col: col, dist: dist }); }
      candidates.sort(function (a, b) { if (a.dist !== b.dist) return a.dist - b.dist; return sortedBase[b.col] - sortedBase[a.col]; });
      var startBeat = note.startBeat;
      var endBeat = (note.type === 2) ? (note.end[0] + note.end[1] / note.end[2]) : startBeat;
      for (var ci = 0; ci < candidates.length; ci++) {
        var col = candidates[ci].col;
        if (!isConflict(col, startBeat, endBeat)) { var assignedNote = Object.assign({}, note, { column: col }); addOccupied(col, startBeat, endBeat); return assignedNote; }
      }
      return null;
    }

    var finalNotes = [];
    if (fullCapture) {
      for (var ni = 0; ni < allNotes.length; ni++) { var note = allNotes[ni]; var XL = getXLForNote(note); var absX = composeAbsX(note, XL); var result = assignNoteByDistance(note, absX); if (result) finalNotes.push(result); }
    } else {
      var assignedNormal = [];
      var failedNormal = [];
      var normalNotes = allNotes.filter(function (n) { return !n.speedZero; });
      for (var i = 0; i < normalNotes.length; i++) { var note1 = normalNotes[i]; var res = tryAssignNote(note1, note1.positionX); if (res) assignedNormal.push(res); else failedNormal.push(note1); }
      var toBind = failedNormal.concat(allNotes.filter(function (n) { return n.speedZero; }));
      var unique = {};
      toBind.forEach(function (n) { unique[n.rawNote] = n; });
      toBind = Object.keys(unique).map(function (k) { return unique[k]; });
      for (var bi = 0; bi < toBind.length; bi++) { var noteB = toBind[bi]; var XLB = getXLForNote(noteB); var absXB = composeAbsX(noteB, XLB); var resB = tryAssignNote(noteB, absXB); if (resB) assignedNormal.push(resB); }
      var assignedSet = new Set(assignedNormal.map(function (n) { return n.rawNote; }));
      var unassigned = [];
      for (var ui = 0; ui < allNotes.length; ui++) { var un = allNotes[ui]; if (!assignedSet.has(un.rawNote)) unassigned.push(un); }
      if (unassigned.length > 0) {
        for (var ui2 = 0; ui2 < unassigned.length; ui2++) {
          var un2 = unassigned[ui2];
          var XL3 = getXLForNote(un2);
          var absX3 = composeAbsX(un2, XL3);
          if (un2.positionX === 0 || Math.abs(absX3) <= tolerance) {
            var centerCol = Math.floor((targetK - 1) / 2);
            var candidates2 = [];
            for (var off = 0; off < targetK; off++) { if (centerCol + off < targetK) candidates2.push(centerCol + off); if (centerCol - off >= 0 && off !== 0) candidates2.push(centerCol - off); }
            var startBeat7 = un2.startBeat;
            var endBeat7 = (un2.type === 2) ? (un2.end[0] + un2.end[1] / un2.end[2]) : startBeat7;
            for (var ci2 = 0; ci2 < candidates2.length; ci2++) { var col5 = candidates2[ci2]; if (!isConflict(col5, startBeat7, endBeat7)) { finalNotes.push(Object.assign({}, un2, { column: col5 })); addOccupied(col5, startBeat7, endBeat7); break; } }
          }
        }
      }
      finalNotes = finalNotes.concat(assignedNormal);
    }
    if (finalNotes.length === 0) return null;
    finalNotes.sort(function (a, b) {
      var sa = a.start[0] + a.start[1] / (a.start[2] || 1);
      var sb = b.start[0] + b.start[1] / (b.start[2] || 1);
      return sa - sb;
    });

    return Object.assign({}, raw, {
      notes: finalNotes.map(function (n) { return { start: n.start, end: n.end, column: n.column, type: n.type }; }),
      chartJson: chartJson, keynum: targetK, is4K: targetK === 4
    });
  }


  function reportConversionCount(report) {
    if (report === 0) return;
    if (typeof fetch !== 'function') return;
    fetch(HIT_URL).catch(function () {});
  }


  var api = {
    version: '0.1.1',

    InputChart: function (file) {
      return new Promise(function (resolve) {
        var name = normalizeName(file && file.name);
        var ext = extOf(name);
        if (SUPPORTED_EXT.indexOf(ext) === -1) {
          resolve({ ok: false, code: 'BAD_FORMAT', message: '文件格式不支持：.' + ext });
          return;
        }
        if (typeof global.JSZip === 'undefined') {
          resolve({ ok: false, code: 'JSZIP_MISSING', message: '未加载 JSZip 库，无法解析谱面' });
          return;
        }

        (async function () {
          var zip;
          try {
            var buf = await file.arrayBuffer();
            zip = await global.JSZip.loadAsync(buf);
          } catch (e) {
            resolve({ ok: false, code: 'BAD_ARCHIVE', message: '压缩包无法解析：' + ((e && e.message) || e) });
            return;
          }

          var rawList = [];
          var failures = [];
          try {
            if (ext === '4kz') {
              var res4 = await scan4KZ(zip);
              rawList = res4.list; failures = res4.failures || [];
            } else if (ext === 'mcz') {
              var r1 = await scanMCZ(zip);
              rawList = r1.charts; failures = r1.failures || [];
            } else if (ext === 'osz') {
              var r2 = await scanOSZ(zip);
              rawList = r2.charts; failures = r2.failures || [];
            } else {
              var d3 = await scanPEZ(zip);
              if (d3) rawList.push(d3); else failures.push({ file: 'info', reason: 'missing_meta' });
            }
          } catch (e) {
            resolve({ ok: false, code: 'PARSE_ERROR', message: '解析失败：' + ((e && e.message) || e) });
            return;
          }

          if (rawList.length === 0) {
            state.loaded = false;
            resolve({ ok: false, code: 'NO_CHART', message: '未解析出有效谱面文件', failures: failures });
            return;
          }

          var raws = rawList.map(function (raw, idx) {
            var c = Object.assign({}, raw);
            c.id = 'c' + idx;
            c.keynum = parseInt(c.keynum, 10) || 4;
            c.is4K = c.keynum === 4;
            c.hasMultipleBPM = !!(c.bpmSegments && c.bpmSegments.length > 1);
            c.duration = c.duration || 0;
            c.notes = c.notes || [];
            return c;
          });

          state.loaded = true;
          state.sourceType = ext;
          state.raw = raws;
          state.detailed = {};
          state.selectedIds = raws.map(function (c) { return c.id; });
          state.warnings = [];
          if (failures.length) pushWarning(failures.length + ' 个谱面解析失败，已忽略');
          resolve({ ok: true, sourceType: ext, levels: raws.map(levelView), failures: failures });
        })();
      });
    },

    InputPreviewData: function (payload) {
      try {
        state = freshState();
        var tmpF = String((payload && payload.tmpF) || '');
        var tmpT = payload && payload.tmpT;
        if (!Array.isArray(tmpT)) tmpT = tmpT ? [String(tmpT)] : [];
        var meta = parseTmpF(tmpF);
        if (!meta.bpmSegments || !meta.bpmSegments.length) {
          return { ok: false, code: 'NO_META', message: '传回谱面缺少元数据' };
        }
        var audioData = payload.audio || null;
        var imageData = payload.image || null;
        var audioName = payload.audioName || '';
        var imageName = payload.imageName || '';
        var raws = [];
        for (var i = 0; i < tmpT.length; i++) {
          var lv = meta.level, ch = meta.charter, kn = meta.keynum;
          if (Array.isArray(lv)) lv = lv[i] !== undefined ? lv[i] : (lv[0] || '4K');
          if (Array.isArray(ch)) ch = ch[i] !== undefined ? ch[i] : (ch[0] || 'Unknown');
          if (Array.isArray(kn)) kn = kn[i] !== undefined ? kn[i] : 4;
          else if (kn === undefined || kn === null || kn === '') kn = 4;
          kn = parseInt(kn, 10);
          if (isNaN(kn) || kn <= 0) kn = 4;
          raws.push({
            type: '4kz',
            title: meta.title || 'Untitled',
            level: (typeof lv === 'string' ? lv : (Array.isArray(lv) ? lv[0] : '4K')) || '4K',
            composer: meta.composer || 'Unknown',
            charter: (typeof ch === 'string' ? ch : (Array.isArray(ch) ? ch[0] : 'Unknown')) || 'Unknown',
            illustrator: meta.illustrator || 'UK',
            audio: meta.audio || '', background: meta.background || '',
            duration: parseFloat(meta.duration) || 0,
            bpmSegments: meta.bpmSegments, hasMultipleBPM: meta.bpmSegments.length > 1,
            offset: parseFloat(meta.offset) || 0,
            notes: [], audioData: audioData, imageData: imageData,
            audioName: audioName, imageName: imageName,
            keynum: kn, is4K: kn === 4,
            _ref: { kind: '4kz', tmpTText: String(tmpT[i] || '') }
          });
        }
        if (!raws.length) return { ok: false, code: 'NO_CHART', message: '传回谱面缺少音符' };
        raws.forEach(function (c, idx) { c.id = 'c' + idx; });
        state.loaded = true;
        state.sourceType = '4kz';
        state.raw = raws;
        state.detailed = {};
        state.selectedIds = raws.map(function (c) { return c.id; });
        state.warnings = [];
        return { ok: true, sourceType: '4kz', levels: raws.map(levelView) };
      } catch (e) {
        return { ok: false, code: 'PREVIEW_IMPORT_ERROR', message: '预览数据导入失败：' + ((e && e.message) || e) };
      }
    },

    PutoutLevels: function () {
      if (!state.loaded || !state.raw.length) return noChart();
      return { ok: true, levels: state.raw.map(levelView) };
    },

    InputLevel: function (ids) {
      if (!state.loaded || !state.raw.length) return noChart();
      var valid = [], invalid = [];
      if (Array.isArray(ids) && ids.length) {
        ids.forEach(function (id) {
          if (state.raw.some(function (c) { return c.id === id; })) valid.push(id);
          else invalid.push(id);
        });
        if (invalid.length) pushWarning('无效的难度 id：' + invalid.join(', '));
        state.selectedIds = valid.length ? valid : state.raw.map(function (c) { return c.id; });
      } else {
        state.selectedIds = state.raw.map(function (c) { return c.id; });
      }

      state.detailed = {};
      var finalized = [];
      state.selectedIds.forEach(function (id) {
        var raw = state.raw.find(function (c) { return c.id === id; });
        if (!raw) return;
        var detailed = null;
        try {
          if (raw._ref.kind === '4kz') detailed = finalize4kz(raw);
          else if (raw._ref.kind === 'mcz') detailed = finalizeMCZ(raw);
          else if (raw._ref.kind === 'osz') detailed = finalizeOSZ(raw);
          else if (raw._ref.kind === 'pez') detailed = finalizePEZ(raw);
        } catch (e) { detailed = null; pushWarning('细解析失败：' + raw.id + '（' + (e && e.message || e) + '）'); }
        if (detailed) { state.detailed[id] = detailed; finalized.push(detailed); }
        else pushWarning('该难度未能完成细解析：' + raw.id);
      });

      if (finalized.length) applyOsuStarToDataList(finalized, state.params.useOsuStarAsLevel);
      return { ok: true, selectedIds: state.selectedIds.slice(), invalid: invalid, levels: finalized.map(levelView) };
    },

    PutoutData: function () {
      if (!state.loaded || !state.raw.length) return noChart();
      return { ok: true, data: selectedCharts().map(metaView) };
    },

    InputData: function (meta) {
      if (!state.loaded || !state.raw.length) return noChart();
      if (!Array.isArray(meta)) return { ok: false, code: 'BAD_INPUT', message: '元数据必须是数组' };
      var defaults = { title: 'Untitled', level: '4K', composer: 'Unknown', charter: 'Unknown', illustrator: 'UK' };
      meta.forEach(function (m) {
        var chart = state.raw.find(function (c) { return c.id === m.id; });
        if (!chart) { pushWarning('未找到谱面 id：' + m.id); return; }
        ['title', 'level', 'composer', 'charter', 'illustrator'].forEach(function (k) {
          if (m[k] !== undefined) chart[k] = String(m[k] || defaults[k]);
        });
        if (m.keynum !== undefined) {
          var kn = parseInt(m.keynum, 10);
          chart.keynum = (kn > 0) ? kn : 4;
        }
        if (state.detailed[m.id]) {
          var d = state.detailed[m.id];
          ['title', 'level', 'composer', 'charter', 'illustrator', 'keynum'].forEach(function (k) {
            if (chart[k] !== undefined) d[k] = chart[k];
          });
        }
      });
      return { ok: true, data: selectedCharts().map(metaView) };
    },

    Putout4kz: function () {
      if (!state.loaded || !state.raw.length) return noChart();
      var list = selectedCharts();
      var d0 = list[0];
      return {
        ok: true,
        tmpF: serializeTmpF(list),
        tmpT: list.map(function (c) { return notesToTmpT(c.notes, c.keynum); }),
        audio: d0.audioData,
        audioName: d0.audioName,
        image: d0.imageData,
        imageName: d0.imageName
      };
    },

    InputParams: function (params) {
      if (!params || typeof params !== 'object') return { ok: false, code: 'BAD_INPUT', message: '参数必须是对象' };
      Object.keys(params).forEach(function (k) {
        if (!(k in DEF_PARAMS)) { pushWarning('未知参数：' + k); return; }
        state.params[k] = params[k];
      });
      state.params.customKeynum = Math.min(10, Math.max(1, parseInt(state.params.customKeynum, 10) || 4));
      state.params.toleranceVal = Math.max(1, parseInt(state.params.toleranceVal, 10) || 120);
      state.params.manualExtremeVal = Math.max(1, parseInt(state.params.manualExtremeVal, 10) || 405);
      state.params.speed = parseFloat(state.params.speed);
      if (!(state.params.speed > 0)) state.params.speed = 10;
      return { ok: true, params: Object.assign({}, state.params) };
    },

    InputGoal: function (goal) {
      if (GOALS.indexOf(goal) === -1) {
        pushWarning('未知目标格式：' + goal + '，已回退默认 pez');
        state.goal = DEFAULT_GOAL;
      } else {
        state.goal = goal;
      }
      return { ok: true, goal: state.goal };
    },

    PutoutFile: function (kind) {
      if (!state.loaded || !state.raw.length) return noChart();
      kind = kind === 'audio' ? 'audio' : 'image';
      var c0 = state.raw[0];
      if (kind === 'audio') {
        if (!c0.audioData) return { ok: false, code: 'NO_AUDIO', message: '未导入音频文件' };
        return { ok: true, kind: 'audio', name: c0.audioName, file: c0.audioData };
      }
      if (!c0.imageData || c0.imageName === PLACEHOLDER_NAME) {
        return { ok: false, code: 'NO_IMAGE', message: '未导入曲绘文件' };
      }
      return { ok: true, kind: 'image', name: c0.imageName, file: c0.imageData };
    },

    PutoutChart: function (report) {
      return new Promise(function (resolve) {
        if (!state.loaded || !state.raw.length) { resolve(noChart()); return; }
        var list = selectedCharts();
        (async function () {
          var packed;
          try {
            packed = await buildPackage(list, state.goal, state.params);
          } catch (e) {
            resolve({ ok: false, code: 'PACK_ERROR', message: '打包失败：' + ((e && e.message) || e), warnings: state.warnings.slice() });
            return;
          }
          var blob = packed.blob;
          var filename = packed.filename ||
            sanitizeFileName(list[0].title) + ' ' + (list[0].level || '4K') + '.' + state.goal;

          var success = !!(blob && list.length);
          if (success) reportConversionCount(report);

          resolve({
            ok: success,
            format: state.goal,
            filename: filename,
            blob: blob,
            count: list.length,
            warnings: state.warnings.slice()
          });
        })();
      });
    },

    Reset: function () {
      state = freshState();
      return { ok: true };
    },

    _debugState: function () {
      return JSON.parse(JSON.stringify(state, function (k, v) {
        if ((k === 'audioData' || k === 'imageData') && v instanceof ArrayBuffer) {
          return '[ArrayBuffer ' + v.byteLength + 'B]';
        }
        return v;
      }));
    }
  };

  state = freshState();
  global.__4kccEngine = api;

})(window);
