#!/usr/bin/env python3
"""Звуки ловушек: синтез без внешних библиотек → sounds/*.wav (моно, 22 050 Гц, 16 бит).

    python3 scripts-dev/gen-sounds.py

Шумы, фильтры и огибающие подобраны на слух; зерно случайности постоянное — файлы не меняются
от запуска к запуску.
"""

import math
import os
import random
import struct
import wave

RATE = 22050
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sounds")
TAU = math.tau


def n(sec):
    return int(sec * RATE)


def silence(sec):
    return [0.0] * n(sec)


def noise(sec, rnd):
    return [rnd.uniform(-1, 1) for _ in range(n(sec))]


def mix(*tracks):
    length = max(len(t) for t in tracks)
    out = [0.0] * length
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def at(track, sec, total=None):
    """Сдвинуть дорожку на sec секунд."""
    pad = [0.0] * n(sec)
    res = pad + track
    if total:
        res = (res + [0.0] * n(total))[: n(total)]
    return res


def gain(track, g):
    return [v * g for v in track]


def env(track, fn):
    L = len(track)
    return [v * fn(i / RATE, i / max(1, L - 1)) for i, v in enumerate(track)]


def decay(tau, attack=0.002):
    return lambda s, p: min(1.0, s / attack) * math.exp(-s / tau)


def bell(peak, width):
    return lambda s, p: math.exp(-(((s - peak) / width) ** 2))


class Biquad:
    """RBJ biquad: lowpass / highpass / bandpass с меняющейся частотой."""

    def __init__(self, kind, q=0.707):
        self.kind = kind
        self.q = q
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0

    def coeffs(self, f):
        f = max(20.0, min(f, RATE * 0.45))
        w = TAU * f / RATE
        cw, sw = math.cos(w), math.sin(w)
        alpha = sw / (2 * self.q)
        if self.kind == "lp":
            b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
        elif self.kind == "hp":
            b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
        else:  # bp, постоянное усиление на пике
            b0, b1, b2 = alpha, 0.0, -alpha
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
        return b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0

    def run(self, track, freq):
        out = []
        cache_f, c = None, None
        for i, x in enumerate(track):
            f = freq(i / RATE) if callable(freq) else freq
            if cache_f is None or abs(f - cache_f) > 1:
                c = self.coeffs(f)
                cache_f = f
            b0, b1, b2, a1, a2 = c
            y = b0 * x + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2
            self.x2, self.x1 = self.x1, x
            self.y2, self.y1 = self.y1, y
            out.append(y)
        return out


def lp(track, f, q=0.707):
    return Biquad("lp", q).run(track, f)


def hp(track, f, q=0.707):
    return Biquad("hp", q).run(track, f)


def bp(track, f, q=1.0):
    return Biquad("bp", q).run(track, f)


def sine(sec, freq, phase=0.0):
    out, ph = [], phase
    for i in range(n(sec)):
        f = freq(i / RATE) if callable(freq) else freq
        ph += TAU * f / RATE
        out.append(math.sin(ph))
    return out


def saw(sec, freq):
    out, ph = [], 0.0
    for i in range(n(sec)):
        f = freq(i / RATE) if callable(freq) else freq
        ph = (ph + f / RATE) % 1.0
        out.append(2 * ph - 1)
    return out


def partials(sec, base, ratios, taus, amps):
    """Металл/колокол: негармоничные призвуки с затуханием."""
    tracks = []
    for r, tau, a in zip(ratios, taus, amps):
        tracks.append(gain(env(sine(sec, base * r), decay(tau, 0.001)), a))
    return mix(*tracks)


def crackle(sec, rnd, density, f=3000, q=1.5):
    """Редкие щелчки (треск огня, электричества)."""
    imp = [0.0] * n(sec)
    for i in range(len(imp)):
        if rnd.random() < density / RATE:
            imp[i] = rnd.uniform(-1, 1)
    return bp(imp, f, q)


def finish(track, peak=0.89, fade_in=0.002, fade_out=0.04):
    m = max(1e-9, max(abs(v) for v in track))
    out = [math.tanh(1.4 * v / m) / math.tanh(1.4) * peak for v in track]
    fi, fo = n(fade_in), n(fade_out)
    for i in range(min(fi, len(out))):
        out[i] *= i / fi
    for i in range(min(fo, len(out))):
        out[-1 - i] *= i / fo
    return out


def save(name, track):
    os.makedirs(ROOT, exist_ok=True)
    path = os.path.join(ROOT, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in track))
    print(f"{name}.wav  {len(track) / RATE:.2f} с")


# ------------------------------------------------------------------ звуки


def click(rnd):
    """Щелчок механизма: два коротких удара с металлическим призвуком."""
    def one():
        body = env(bp(noise(0.05, rnd), 2600, 3), decay(0.006, 0.0005))
        ping = env(partials(0.15, 2300, [1, 2.4, 3.9], [0.04, 0.025, 0.015], [0.4, 0.25, 0.15]), decay(0.06, 0.0005))
        return mix(body, ping)

    return finish(mix(one(), at(gain(one(), 0.7), 0.09)), fade_out=0.02)


def thud(rnd):
    """Глухой удар о дно ямы + осыпающаяся земля."""
    boom = env(sine(0.9, lambda s: 38 + 50 * math.exp(-s * 10)), decay(0.22, 0.003))
    hit = env(lp(noise(0.5, rnd), 380), decay(0.09, 0.001))
    grit = env(lp(crackle(1.1, rnd, 120, 1800, 0.9), 2600), lambda s, p: math.exp(-((s - 0.35) / 0.3) ** 2))
    return finish(mix(gain(boom, 1.0), gain(hit, 0.9), at(gain(grit, 2.5), 0.05)))


def whoosh(rnd):
    """Свист летящих снарядов: три полосовых шума с бегущей частотой."""
    def one(f0, f1, dur):
        tr = bp(noise(dur, rnd), lambda s: f0 + (f1 - f0) * math.sin(math.pi * min(1, s / dur)), 2.2)
        return env(tr, bell(dur * 0.55, dur * 0.25))

    a = one(500, 2600, 0.34)
    b = one(600, 3000, 0.3)
    c = one(450, 2300, 0.36)
    return finish(mix(a, at(gain(b, 0.8), 0.07), at(gain(c, 0.7), 0.15)), fade_out=0.05)


def hiss(rnd):
    """Шипение газа из отверстий."""
    tr = hp(noise(2.2, rnd), 3200)
    tr = lp(tr, 9000)
    shape = lambda s, p: min(1, s / 0.12) * (0.75 + 0.25 * math.sin(TAU * 5.5 * s)) * (1 - p) ** 1.3
    return finish(env(tr, shape), peak=0.7)


def fire(rnd):
    """Вспышка пламени: «вуф», рёв и треск."""
    whump = env(sine(0.6, lambda s: 70 + 60 * math.exp(-s * 14)), decay(0.12, 0.004))
    roar = lp(noise(1.8, rnd), lambda s: 500 + 900 * math.exp(-s * 2.5))
    roar = env(roar, lambda s, p: min(1, s / 0.05) * (1 - p) ** 1.6)
    cr = env(crackle(1.8, rnd, 90, 3200, 2), lambda s, p: min(1, s / 0.1) * (1 - p))
    return finish(mix(gain(whump, 1.0), gain(roar, 1.3), gain(cr, 1.6)))


def zap(rnd):
    """Разряд молнии: дребезжащая пила, треск и раскат."""
    buzz = saw(0.7, lambda s: 90 + 40 * math.sin(s * 210) + rnd.uniform(-30, 30))
    buzz = env(lp(buzz, 2600), lambda s, p: (0.5 + 0.5 * (rnd.random() > 0.35)) * math.exp(-s / 0.22))
    cr = env(crackle(0.8, rnd, 900, 4200, 1.2), decay(0.25, 0.001))
    snap = env(hp(noise(0.08, rnd), 1500), decay(0.015, 0.0005))
    rumble = env(lp(noise(1.3, rnd), 140), lambda s, p: math.exp(-((s - 0.35) / 0.35) ** 2))
    return finish(mix(gain(buzz, 0.8), gain(cr, 2.2), gain(snap, 1.2), at(gain(rumble, 2.0), 0.05)))


def crack(rnd):
    """Лёд: треск и хрустальные звоны."""
    cr = env(bp(noise(0.25, rnd), 2200, 0.9), decay(0.05, 0.0005))
    tracks = [gain(cr, 1.3)]
    for k in range(7):
        base = rnd.uniform(2400, 5200)
        p = partials(0.7, base, [1, 1.47, 2.09], [0.25, 0.18, 0.1], [0.5, 0.3, 0.2])
        tracks.append(at(gain(p, rnd.uniform(0.25, 0.45)), 0.02 + k * rnd.uniform(0.04, 0.09)))
    hissy = env(hp(noise(1.1, rnd), 5000), lambda s, p: (1 - p) ** 2)
    tracks.append(gain(hissy, 0.25))
    return finish(mix(*tracks))


def boom(rnd):
    """Громовой удар."""
    low = env(sine(1.6, lambda s: 28 + 70 * math.exp(-s * 6)), decay(0.45, 0.002))
    blast = env(lp(noise(1.6, rnd), lambda s: 200 + 1800 * math.exp(-s * 8)), decay(0.4, 0.001))
    snap = env(hp(noise(0.06, rnd), 2000), decay(0.012, 0.0003))
    return finish(mix(gain(low, 1.3), gain(blast, 1.4), gain(snap, 0.8)))


def slash(rnd):
    """Маятник: свист лезвия и металлический звон."""
    sw = bp(noise(0.4, rnd), lambda s: 700 + 2600 * math.sin(math.pi * min(1, s / 0.4)), 1.8)
    sw = env(sw, bell(0.2, 0.08))
    ring = partials(0.8, 1180, [1, 2.43, 3.67, 5.1], [0.28, 0.2, 0.12, 0.08], [0.6, 0.35, 0.25, 0.15])
    return finish(mix(gain(sw, 1.2), at(gain(ring, 0.6), 0.2)))


def rumble(rnd):
    """Обвал: гул, удары камней, осыпь."""
    base = env(lp(noise(2.3, rnd), 160), lambda s, p: min(1, s / 0.25) * (1 - p) ** 1.2 * (0.7 + 0.3 * math.sin(TAU * 3 * s)))
    tracks = [gain(base, 2.2)]
    for k in range(9):
        hit = env(lp(noise(0.3, rnd), rnd.uniform(250, 600)), decay(rnd.uniform(0.04, 0.08), 0.001))
        knock = env(sine(0.3, rnd.uniform(55, 95)), decay(0.08, 0.002))
        tracks.append(at(gain(mix(hit, knock), rnd.uniform(0.5, 1.0)), rnd.uniform(0.05, 1.5)))
    grit = env(lp(crackle(2.3, rnd, 160, 2000, 0.8), 3500), lambda s, p: (1 - p))
    tracks.append(gain(grit, 1.5))
    return finish(mix(*tracks))


def alarm(rnd):
    """Сигнальный колокол: три удара."""
    def strike():
        return partials(0.9, 880, [1, 2.76, 5.4, 8.93], [0.5, 0.3, 0.15, 0.08], [0.7, 0.35, 0.2, 0.1])

    return finish(mix(strike(), at(gain(strike(), 0.9), 0.36), at(gain(strike(), 0.8), 0.72)), fade_out=0.15)


def sizzle(rnd):
    """Кислота: шипение с пузырями."""
    base = env(bp(noise(1.6, rnd), 5200, 0.8), lambda s, p: min(1, s / 0.08) * (1 - p) ** 1.5)
    pops = env(crackle(1.6, rnd, 260, 2600, 3), lambda s, p: (1 - p))
    splash = env(bp(noise(0.3, rnd), 1200, 0.7), decay(0.07, 0.002))
    return finish(mix(gain(base, 1.0), gain(pops, 2.2), gain(splash, 1.2)), peak=0.8)


def snap(rnd):
    """Капкан: лязг стальных челюстей."""
    hit = env(hp(noise(0.1, rnd), 1200), decay(0.01, 0.0003))
    clang = partials(0.7, 610, [1, 2.49, 4.27, 6.7], [0.22, 0.14, 0.09, 0.05], [0.8, 0.45, 0.3, 0.15])
    rattle = env(crackle(0.4, rnd, 300, 3500, 2), decay(0.1, 0.001))
    return finish(mix(gain(hit, 1.3), clang, at(gain(rattle, 1.2), 0.03)))


def drone(rnd):
    """Печать увядания: низкий нарастающий гул и шёпот."""
    a = saw(1.9, 55)
    b = saw(1.9, 58.3)
    pad = lp(mix(a, b), lambda s: 300 + 500 * math.sin(math.pi * min(1, s / 1.9)))
    pad = env(pad, lambda s, p: math.sin(math.pi * p) ** 1.5)
    whisper = env(bp(noise(1.9, rnd), lambda s: 1800 + 600 * math.sin(TAU * 0.8 * s), 4), lambda s, p: math.sin(math.pi * p) ** 2)
    hit = env(lp(noise(0.8, rnd), 220), lambda s, p: math.exp(-((s - 0.6) / 0.12) ** 2))
    return finish(mix(gain(pad, 1.0), gain(whisper, 1.6), at(gain(hit, 1.4), 0.65)))


def chime(rnd):
    """Руна вспыхивает: восходящие звоны."""
    tracks = []
    for k, f in enumerate([660, 880, 1320, 1760]):
        tracks.append(at(gain(partials(0.9, f, [1, 2.0, 3.01], [0.35, 0.2, 0.1], [0.6, 0.25, 0.1]), 0.8), k * 0.07))
    shimmer = env(hp(noise(1.1, rnd), 7000), lambda s, p: math.sin(math.pi * p) * 0.6)
    tracks.append(gain(shimmer, 0.2))
    return finish(mix(*tracks), fade_out=0.15)


SOUNDS = {
    "click": click,
    "thud": thud,
    "whoosh": whoosh,
    "hiss": hiss,
    "fire": fire,
    "zap": zap,
    "crack": crack,
    "boom": boom,
    "slash": slash,
    "rumble": rumble,
    "alarm": alarm,
    "sizzle": sizzle,
    "snap": snap,
    "drone": drone,
    "chime": chime,
}

if __name__ == "__main__":
    for i, (name, fn) in enumerate(SOUNDS.items()):
        save(name, fn(random.Random(1000 + i)))
