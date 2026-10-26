"""macOS용 앱 아이콘 생성: 투명 배경 원본(app-icon.png)을 배경이 캔버스 끝까지 찬 정사각형으로 변환.

macOS 26(Tahoe)은 둥근 사각형 틀을 꽉 채우지 않는 아이콘을 회색 판 위에 축소해 올리므로,
macOS 번들 아이콘(icon.icns)만 이 스크립트 결과로 만든다. (Windows .ico 등은 투명 원본 유지)

사용법 (Pillow, numpy 필요):
  python3 scripts/make-mac-icon.py app-icon.png app-icon-mac.png 0.80
  # 0.80 = 모니터·빛줄기·다리가 차지할 캔버스 비율 (안전 영역)
  # 이후 iconutil로 src-tauri/icons/icon.icns 재생성 (CLAUDE.md 참고)
"""
import sys
from PIL import Image, ImageFilter
import numpy as np

src, out, fill = sys.argv[1], sys.argv[2], float(sys.argv[3])  # fill: 콘텐츠가 차지할 캔버스 비율
im = np.array(Image.open(src).convert('RGBA')).astype(np.float64)
rgb, alpha = im[:, :, :3], im[:, :, 3] / 255.0
H, W = alpha.shape
yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)

# 1. 배경(파란 그라데이션) 픽셀만 골라 3차 다항식으로 색 모델 적합
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
bgmask = (alpha > 0.99) & (r < 90) & (b > 175) & (g > 90)
def feats(x, y):
    x = x / W; y = y / H
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y, x**3, x*x*y, x*y*y, y**3], -1)
F = feats(xx[bgmask], yy[bgmask])
coef = np.linalg.lstsq(F, rgb[bgmask], rcond=None)[0]
def bg_at(x, y):
    return feats(x, y) @ coef
resid = np.abs(F @ coef - rgb[bgmask]).mean(0)
print('bg pixels', bgmask.sum(), 'mean residual', resid.round(2))

# 2. 전경 = 원본 - 배경 모델 (투명 영역은 0). 안티앨리어싱·그림자 보존
bg_old = bg_at(xx, yy)
delta = (rgb - bg_old) * alpha[..., None]

# 원래 둥근 사각형 경계 근처에서는 배경색 계열 픽셀의 차이를 0으로 서서히 줄여 경계선 자국 제거
# (경계까지의 거리를 MinFilter 반복으로 근사, 0~96px 구간에서 페이드)
opaque = Image.fromarray(((alpha > 0.5) * 255).astype(np.uint8))
dist = np.zeros((H, W))
m = opaque
for step in range(12):
    m = m.filter(ImageFilter.MinFilter(17))   # 8px씩 침식
    dist += (np.array(m) > 0) * 8
fade = np.clip(dist / 96.0, 0, 1)
fade = fade * fade * (3 - 2 * fade)           # smoothstep
bglike_all = (r < 110) & (b > 160) & (g > 80)
w = np.where(bglike_all, fade, 1.0)
# 반투명 가장자리(안티앨리어싱 테두리)의 어두운 띠 제거. 모서리에 걸친 노란 빛줄기만 유지
yellow = (r > 150) & (g > 140) & (b < 140)
w = np.where((alpha < 0.99) & ~yellow, 0.0, w)
delta = delta * w[..., None]
# 전경 판별: 배경 그라데이션 색 계열(파랑/청록)이 아닌 불투명 픽셀 (모니터, 화면, 빛줄기)
bglike = (r < 110) & (b > 160) & (g > 80)
fgmask = (alpha > 0.9) & ~bglike
# 작은 잡티 제거: 행/열에 전경 픽셀이 충분할 때만 bbox에 포함
rows = np.where(fgmask.sum(1) > 3)[0]; cols = np.where(fgmask.sum(0) > 3)[0]
x0, x1, y0, y1 = cols.min(), cols.max(), rows.min(), rows.max()
print('content bbox', x0, x1, y0, y1)

# 3. 콘텐츠 중심을 캔버스 중심에, 콘텐츠 긴 변이 fill 비율이 되도록 배치
N = 1024
k = fill * N / max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
ny, nx = np.mgrid[0:N, 0:N].astype(np.float64)
ox = cx + (nx - N / 2) / k   # 새 캔버스 → 원본 좌표
oy = cy + (ny - N / 2) / k
print('scale', round(k, 3), 'old coord range x', ox.min().round(), ox.max().round(), 'y', oy.min().round(), oy.max().round())

# 배경: 원본 좌표 기준으로 그라데이션 연장
# 원래 둥근 사각형 바깥은 다항식 외삽 대신 가장자리 색을 그대로 연장 (모서리 색 틀어짐 방지)
sq = np.where(alpha > 0.5); sx0, sx1, sy0, sy1 = sq[1].min(), sq[1].max(), sq[0].min(), sq[0].max()
bg_new = np.clip(bg_at(np.clip(ox, sx0, sx1), np.clip(oy, sy0, sy1)), 0, 255)
# 전경 delta를 새 좌표로 리샘플 (채널별 float bicubic)
inv = (1 / k, 0, cx - (N / 2) / k, 0, 1 / k, cy - (N / 2) / k)
chans = []
for c in range(3):
    ch = Image.fromarray(delta[..., c].astype(np.float32), mode='F')
    chans.append(np.array(ch.transform((N, N), Image.AFFINE, inv, resample=Image.BICUBIC)))
delta_new = np.stack(chans, -1)
outimg = np.clip(bg_new + delta_new, 0, 255).astype(np.uint8)
# Tauri's development-window icon loader requires RGBA, even when fully opaque.
Image.fromarray(outimg, 'RGB').convert('RGBA').save(out)
print('saved', out)
