'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TrendingUp, Plus, Minus, RotateCcw } from 'lucide-react';

export interface ChartPerson {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
}

export interface ChartDataPoint {
  dateStr: string;
  label: string; // e.g. "Agu 2026", "25–31 Agu", "12 Agu"
  fullDateLabel: string; // e.g. "Agustus 2026", "Minggu: 25 Agu – 31 Agu 2026"
  counts: Record<string, number>; // personId -> number
  total: number;
}

interface JobLineChartProps {
  data: ChartDataPoint[];
  persons: ChartPerson[];
  activePersonIds: Set<string>;
  unitLabel?: string;
  showTotalLine?: boolean;
  hoveredPersonId?: string | null;
  onHoverPerson?: (id: string | null) => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Fritsch-Carlson Monotone Cubic Spline Interpolation
 * Guarantees zero overshoot, completely eliminates baseline oscillations (no dips below 0),
 * and produces silky, organic curves matching Linear, Stripe, and Figma analytics.
 */
function createMonotoneCubicPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (n === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const deltax = points[i + 1].x - points[i].x;
    const deltay = points[i + 1].y - points[i].y;
    dx.push(deltax);
    dy.push(deltay);
    slopes.push(deltax === 0 ? 0 : deltay / deltax);
  }

  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    const sPrev = slopes[i - 1];
    const sCur = slopes[i];
    if (sPrev * sCur <= 0) {
      tangents.push(0);
    } else {
      tangents.push((2 * sPrev * sCur) / (sPrev + sCur));
    }
  }
  tangents.push(slopes[slopes.length - 1]);

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const segmentDx = dx[i];
    const cp1x = p0.x + segmentDx / 3;
    const cp1y = p0.y + (tangents[i] * segmentDx) / 3;
    const cp2x = p1.x - segmentDx / 3;
    const cp2y = p1.y - (tangents[i + 1] * segmentDx) / 3;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  return path;
}

export const JobLineChart = React.memo(function JobLineChart({
  data,
  persons,
  activePersonIds,
  unitLabel = 'job',
  showTotalLine = false,
  hoveredPersonId: externalHoveredPersonId,
  onHoverPerson,
}: JobLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalHoveredPersonId, setInternalHoveredPersonId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Zoom & Pan state (1x = 100% full view, up to 4x = 400% zoom)
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragRef = useRef<{ startClientX: number; startPanX: number }>({ startClientX: 0, startPanX: 0 });

  const activeHoveredPersonId =
    externalHoveredPersonId !== undefined ? externalHoveredPersonId : internalHoveredPersonId;

  // Responsive container width tracking (guarantees 1:1 pixel rendering without inward letterboxing)
  const [containerWidth, setContainerWidth] = useState<number>(840);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // SVG Dimension system (1:1 with container pixels, responsive for mobile)
  const isMobile = containerWidth > 0 && containerWidth < 540;
  const VIEW_WIDTH = Math.max(280, containerWidth);
  const VIEW_HEIGHT = isMobile ? 180 : 280;
  const PADDING = isMobile
    ? { top: 16, right: 6, bottom: 20, left: 18 }
    : { top: 22, right: 6, bottom: 24, left: 24 };

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

  // Compute scaled plot dimensions with zoom
  const scaledPlotWidth = plotWidth * zoom;
  const maxPan = Math.max(0, scaledPlotWidth - plotWidth);
  const clampedPanX = Math.max(0, Math.min(panX, maxPan));

  // Filter visible persons
  const visiblePersons = useMemo(() => {
    return persons.filter((p) => activePersonIds.has(p.id));
  }, [persons, activePersonIds]);

  // Compute Maximum Y value tightly fitted to data (eliminates excessive empty headroom)
  const maxY = useMemo(() => {
    let max = 0;
    data.forEach((d) => {
      if (showTotalLine && d.total > max) {
        max = d.total;
      }
      visiblePersons.forEach((p) => {
        const val = d.counts[p.id] || 0;
        if (val > max) max = val;
      });
    });

    if (max <= 0) return 3;
    if (max <= 5) return max;
    if (max <= 10) return max % 2 === 0 ? max : max + 1;
    if (max <= 25) return Math.ceil(max / 5) * 5;
    if (max <= 50) return Math.ceil(max / 10) * 10;
    return Math.ceil(max / 20) * 20;
  }, [data, visiblePersons, showTotalLine]);

  // Clean, evenly spaced discrete integer Y ticks
  const yTicks = useMemo(() => {
    if (maxY <= 0) return [0, 1, 2, 3];
    if (maxY <= 5) {
      const ticks: number[] = [];
      for (let i = 0; i <= maxY; i++) ticks.push(i);
      return ticks;
    }
    if (maxY <= 10) {
      const ticks: number[] = [];
      for (let i = 0; i <= maxY; i += 2) ticks.push(i);
      return ticks;
    }
    const targetSteps = 4;
    const rawStep = maxY / targetSteps;
    const step = Math.max(1, Math.ceil(rawStep));
    const ticks: number[] = [0];
    for (let i = step; i <= maxY; i += step) {
      ticks.push(i);
    }
    if (ticks[ticks.length - 1] < maxY) {
      ticks.push(maxY);
    }
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [maxY]);

  // Coordinate mappers (aware of zoom & pan)
  const getX = useCallback(
    (index: number) => {
      if (data.length <= 1) return PADDING.left + plotWidth / 2;
      return PADDING.left + (index / (data.length - 1)) * scaledPlotWidth - clampedPanX;
    },
    [data.length, PADDING.left, plotWidth, scaledPlotWidth, clampedPanX]
  );

  const getY = useCallback(
    (value: number) => {
      if (maxY === 0) return PADDING.top + plotHeight;
      const normalized = Math.max(0, Math.min(value, maxY)) / maxY;
      return PADDING.top + plotHeight - normalized * plotHeight;
    },
    [maxY, PADDING.top, plotHeight]
  );

  // Compute individual contributor series
  const personSeries = useMemo(() => {
    return visiblePersons.map((person) => {
      const points: Point[] = data.map((d, index) => ({
        x: getX(index),
        y: getY(d.counts[person.id] || 0),
      }));

      const linePath = createMonotoneCubicPath(points);

      const baselineY = PADDING.top + plotHeight;
      const firstX = points[0]?.x ?? PADDING.left;
      const lastX = points[points.length - 1]?.x ?? PADDING.left + plotWidth;
      const areaPath =
        points.length > 0
          ? `${linePath} L ${lastX.toFixed(1)} ${baselineY} L ${firstX.toFixed(1)} ${baselineY} Z`
          : '';

      return {
        person,
        points,
        linePath,
        areaPath,
      };
    });
  }, [visiblePersons, data, getX, getY, PADDING.top, plotHeight, plotWidth, PADDING.left]);

  // Optional Total Team series
  const totalTeamSeries = useMemo(() => {
    if (!showTotalLine) return null;
    const points: Point[] = data.map((d, index) => ({
      x: getX(index),
      y: getY(d.total),
    }));
    const linePath = createMonotoneCubicPath(points);
    const baselineY = PADDING.top + plotHeight;
    const firstX = points[0]?.x ?? PADDING.left;
    const lastX = points[points.length - 1]?.x ?? PADDING.left + plotWidth;
    const areaPath =
      points.length > 0
        ? `${linePath} L ${lastX.toFixed(1)} ${baselineY} L ${firstX.toFixed(1)} ${baselineY} Z`
        : '';
    return { points, linePath, areaPath };
  }, [showTotalLine, data, getX, getY, PADDING.top, plotHeight, plotWidth, PADDING.left]);

  const totalCompletedInView = useMemo(() => {
    return data.reduce((sum, d) => sum + d.total, 0);
  }, [data]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(4, Number((prev * 1.25).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(1, Number((prev / 1.25).toFixed(2)));
      if (next === 1) setPanX(0);
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
  }, []);

  // Mouse wheel zoom support
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Zoom if Ctrl is pressed or directly with wheel
      if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        setZoom((prev) => {
          const next = Math.min(4, Math.max(1, Number((prev * factor).toFixed(2))));
          if (next === 1) setPanX(0);
          return next;
        });
      }
    },
    []
  );

  // Mouse drag-to-pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (zoom > 1) {
        setIsDragging(true);
        dragRef.current = {
          startClientX: e.clientX,
          startPanX: clampedPanX,
        };
      }
    },
    [zoom, clampedPanX]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!containerRef.current || data.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();

      // If currently dragging to pan
      if (isDragging && zoom > 1) {
        const deltaClientX = e.clientX - dragRef.current.startClientX;
        const svgScale = VIEW_WIDTH / rect.width;
        const deltaSvgX = deltaClientX * svgScale;
        setPanX(Math.max(0, Math.min(dragRef.current.startPanX - deltaSvgX, maxPan)));
        return;
      }

      // Tracking crosshair & tooltip
      const relativeX = e.clientX - rect.left;
      const svgScaleX = VIEW_WIDTH / rect.width;
      const chartX = relativeX * svgScaleX;

      // Only search when cursor is within plot area
      if (chartX < PADDING.left || chartX > PADDING.left + plotWidth) {
        setHoverIndex(null);
        setTooltipPos(null);
        return;
      }

      let closestIdx = 0;
      let minDistance = Infinity;

      data.forEach((_, idx) => {
        const x = getX(idx);
        const dist = Math.abs(chartX - x);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      setHoverIndex(closestIdx);

      const clientTargetX = (getX(closestIdx) / VIEW_WIDTH) * rect.width;
      const isRightSide = clientTargetX > rect.width * 0.52;
      const tooltipX = isRightSide ? clientTargetX - 225 : clientTargetX + 16;

      setTooltipPos({
        x: Math.max(16, Math.min(tooltipX, rect.width - 240)),
        y: 20,
      });
    },
    [data, getX, VIEW_WIDTH, isDragging, zoom, maxPan, PADDING.left, plotWidth]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setHoverIndex(null);
    setTooltipPos(null);
    setInternalHoveredPersonId(null);
    onHoverPerson?.(null);
  }, [onHoverPerson]);

  // X-axis ticks that fall inside the visible plot area
  const visibleXTicks = useMemo(() => {
    return data
      .map((d, index) => ({ ...d, index, x: getX(index) }))
      .filter((tick) => tick.x >= PADDING.left - 10 && tick.x <= PADDING.left + plotWidth + 10);
  }, [data, getX, PADDING.left, plotWidth]);

  const activePoint = hoverIndex !== null ? data[hoverIndex] : null;

  if (data.length === 0 || totalCompletedInView === 0) {
    return (
      <div className="figma-chart-canvas-wrap">
        <div className="figma-chart-empty">
          <TrendingUp size={24} strokeWidth={1.75} />
          <span className="figma-chart-empty-text">Belum ada data pekerjaan selesai</span>
          <span className="figma-chart-empty-subtext">
            Pekerjaan yang dipindahkan ke status &quot;Selesai&quot; akan otomatis divisualisasikan di sini.
          </span>
        </div>
      </div>
    );
  }

  const shouldShowAreaForPerson = (personId: string) => {
    if (activeHoveredPersonId) {
      return activeHoveredPersonId === personId;
    }
    return visiblePersons.length === 1;
  };

  return (
    <div
      className="figma-chart-canvas-wrap"
      ref={containerRef}
      onWheel={handleWheel}
      style={{
        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
      }}
    >
      {/* Floating Figma Zoom Controls */}
      <div className="figma-chart-top-actions">
        <div className="figma-chart-zoom-controls">
          <button
            type="button"
            className="figma-zoom-btn"
            onClick={handleZoomOut}
            disabled={zoom <= 1.02}
            title="Perkecil zoom graf"
          >
            <Minus size={11} strokeWidth={2.5} />
          </button>
          <span className="figma-zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="figma-zoom-btn"
            onClick={handleZoomIn}
            disabled={zoom >= 3.98}
            title="Perbesar zoom graf"
          >
            <Plus size={11} strokeWidth={2.5} />
          </button>
          {zoom > 1.05 && (
            <button
              type="button"
              className="figma-zoom-btn reset"
              onClick={handleResetZoom}
              title="Reset tampilan penuh (100%)"
            >
              <RotateCcw size={10} strokeWidth={2.2} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      <svg
        className="figma-svg-chart"
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          {/* Plot clipping mask for zoom/pan so lines don't bleed into Y-axis margins */}
          <clipPath id="chart-plot-clip">
            <rect
              x={PADDING.left}
              y={PADDING.top - 8}
              width={plotWidth}
              height={plotHeight + 12}
            />
          </clipPath>

          {visiblePersons.map((p) => (
            <linearGradient key={`grad-${p.id}`} id={`area-gradient-${p.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity="0.22" />
              <stop offset="70%" stopColor={p.color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0" />
            </linearGradient>
          ))}
          {showTotalLine && (
            <linearGradient id="area-gradient-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d99ff" stopOpacity="0.16" />
              <stop offset="80%" stopColor="#0d99ff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#0d99ff" stopOpacity="0" />
            </linearGradient>
          )}
        </defs>

        {/* Horizontal Gridlines & Fixed Y-Axis Labels */}
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={`ytick-${tick}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={VIEW_WIDTH - PADDING.right}
                y2={y}
                className="figma-grid-line"
              />
              <text
                x={0}
                y={y + 3.5}
                textAnchor="start"
                className="figma-axis-label"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* X-Axis Baseline */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={VIEW_WIDTH - PADDING.right}
          y2={PADDING.top + plotHeight}
          className="figma-axis-line"
        />

        {/* X-Axis Labels (Filtered within viewport) */}
        {visibleXTicks.map((tick) => (
          <text
            key={`xtick-${tick.dateStr}-${tick.index}`}
            x={tick.x}
            y={VIEW_HEIGHT - 6}
            textAnchor="middle"
            className="figma-axis-label"
          >
            {tick.label}
          </text>
        ))}

        {/* Clipped Data Plot Area (Enables seamless zoom and horizontal panning) */}
        <g clipPath="url(#chart-plot-clip)">
          {/* Total Team Series (if enabled) */}
          {totalTeamSeries && (
            <g key="series-total-team" opacity={activeHoveredPersonId ? 0.2 : 1}>
              <path
                d={totalTeamSeries.areaPath}
                fill="url(#area-gradient-total)"
                pointerEvents="none"
              />
              <path
                d={totalTeamSeries.linePath}
                fill="none"
                stroke="#0d99ff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            </g>
          )}

          {/* Individual Contributor Line Series */}
          {personSeries.map(({ person, linePath, areaPath }) => {
            const isHovered = activeHoveredPersonId === person.id;
            const isFaded = activeHoveredPersonId !== null && !isHovered;
            const showArea = shouldShowAreaForPerson(person.id);

            return (
              <g
                key={`series-${person.id}`}
                style={{
                  transition: 'opacity 150ms ease',
                  opacity: isFaded ? 0.18 : 1,
                }}
                onMouseEnter={() => {
                  setInternalHoveredPersonId(person.id);
                  onHoverPerson?.(person.id);
                }}
              >
                {/* Single isolated area gradient on hover */}
                {showArea && areaPath && (
                  <path
                    d={areaPath}
                    fill={`url(#area-gradient-${person.id})`}
                    pointerEvents="none"
                  />
                )}

                {/* Monotone Line */}
                {linePath && (
                  <>
                    <path
                      d={linePath}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="14"
                      strokeLinecap="round"
                      style={{ cursor: 'pointer' }}
                    />
                    <path
                      d={linePath}
                      fill="none"
                      stroke={person.color}
                      strokeWidth={isHovered ? 3.5 : 2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                      style={{
                        transition: 'stroke-width 150ms ease',
                      }}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Interactive Vertical Crosshair Guide */}
          {hoverIndex !== null && (
            <line
              x1={getX(hoverIndex)}
              y1={PADDING.top}
              x2={getX(hoverIndex)}
              y2={PADDING.top + plotHeight}
              className="figma-chart-crosshair"
            />
          )}

          {/* Hover-Only Interactive Glowing Dots */}
          {hoverIndex !== null && (
            <>
              {personSeries.map(({ person, points }) => {
                const pt = points[hoverIndex];
                if (!pt) return null;
                const val = activePoint?.counts[person.id] || 0;
                if (val === 0) return null;

                const isHovered = activeHoveredPersonId === person.id;
                const isFaded = activeHoveredPersonId !== null && !isHovered;

                return (
                  <g
                    key={`hover-dot-${person.id}`}
                    style={{
                      opacity: isFaded ? 0.2 : 1,
                      transition: 'opacity 150ms ease',
                    }}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 8 : 6}
                      fill={person.color}
                      opacity="0.25"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5 : 4}
                      fill="#ffffff"
                      stroke={person.color}
                      strokeWidth={isHovered ? 3 : 2}
                    />
                  </g>
                );
              })}
            </>
          )}
        </g>
      </svg>

      {/* Floating Figma Dark Tooltip */}
      {activePoint && tooltipPos && (
        <div
          className="figma-chart-tooltip"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="figma-tooltip-date">{activePoint.fullDateLabel}</div>

          {visiblePersons.filter((p) => (activePoint.counts[p.id] || 0) > 0).length === 0 ? (
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', padding: '3px 0' }}>
              Tidak ada job selesai
            </div>
          ) : (
            visiblePersons
              .map((p) => ({
                person: p,
                count: activePoint.counts[p.id] || 0,
              }))
              .filter((item) => item.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, 7)
              .map(({ person, count }) => (
                <div
                  key={`tooltip-${person.id}`}
                  className="figma-tooltip-row"
                  style={{
                    fontWeight: activeHoveredPersonId === person.id ? 700 : 400,
                    opacity: activeHoveredPersonId && activeHoveredPersonId !== person.id ? 0.5 : 1,
                  }}
                >
                  <div className="figma-tooltip-person">
                    <span
                      className="figma-tooltip-dot"
                      style={{ backgroundColor: person.color }}
                    />
                    <span className="figma-tooltip-name">{person.name}</span>
                  </div>
                  <span className="figma-tooltip-count">
                    {count} {unitLabel}
                  </span>
                </div>
              ))
          )}

          <div className="figma-tooltip-total">
            <span>Total Bulan Ini</span>
            <span style={{ color: '#0d99ff', fontWeight: 600 }}>{activePoint.total} selesai</span>
          </div>
        </div>
      )}
    </div>
  );
});
