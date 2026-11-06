import { useEffect, useMemo, useRef, useState } from 'react';
import { geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries from 'i18n-iso-countries';
import world from 'world-atlas/countries-110m.json';

const WIDTH = 640;
const HEIGHT = 400;

// Pin outline: a round head with its point at (0, 0).
const PIN = 'M0 0 C-2 -6 -9 -9 -9 -15 A9 9 0 1 1 9 -15 C9 -9 2 -6 0 0 Z';

// The part of the world shown, as in the client's demo: the Americas to East Asia,
// without the far south. Land outside it is cut off at the edge of the map.
const FRAME = {
  type: 'MultiPoint',
  coordinates: [
    [-128, 72],
    [150, 72],
    [-128, -42],
    [150, -42],
  ],
};

// Country shapes once, without Antarctica (it only takes space).
const SHAPES = feature(world, world.objects.countries).features.filter(shape => shape.id !== '010');

/*
 * World map of where the outsourcing happens. Countries in `places` are shaded,
 * each gets a pin, and a dashed line joins the head office to every other country.
 * Loaded on its own (React.lazy) so the map data only downloads on the dashboard.
 */
export default function FootprintMap({ places }) {
  const svgRef = useRef(null);
  const scale = useOnScreenScale(svgRef);
  const projection = useMemo(() => geoNaturalEarth1().fitSize([WIDTH, HEIGHT], FRAME), []);
  const path = useMemo(() => geoPath(projection), [projection]);

  // Map each place (ISO alpha-2, e.g. "PL") to its shape and a point to pin.
  const pinned = useMemo(() => {
    return places
      .map(place => {
        const numeric = countries.alpha2ToNumeric(place.code);
        const shape = SHAPES.find(s => s.id === numeric);
        if (!shape) return null;

        const [x, y] = projection(geoCentroid(shape));
        return { ...place, shapeId: shape.id, x, y, headOffice: place.roles.includes('Head office') };
      })
      .filter(Boolean);
  }, [places, projection]);

  const labelled = useMemo(() => placeLabels(pinned, scale), [pinned, scale]);

  const shaded = new Set(pinned.map(p => p.shapeId));
  const home = pinned.find(p => p.headOffice);

  return (
    <svg
      ref={svgRef}
      className="ov-map"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Countries involved: ${pinned.map(p => p.name).join(', ')}`}
    >
      <g className="ov-map-land">
        {SHAPES.map(shape => (
          <path
            key={shape.id ?? shape.properties.name}
            d={path(shape)}
            className={shaded.has(shape.id) ? 'on' : ''}
          />
        ))}
      </g>

      {home ? (
        <g className="ov-map-routes">
          {pinned
            .filter(p => p !== home)
            .map(p => {
              // A gentle curve from the head office to each country.
              const midX = (home.x + p.x) / 2;
              const midY = Math.min(home.y, p.y) - Math.abs(home.x - p.x) * 0.18 - 10;
              return <path key={p.code} d={`M${home.x},${home.y} Q${midX},${midY} ${p.x},${p.y}`} />;
            })}
        </g>
      ) : null}

      <g className="ov-map-pins">
        {labelled.map(p => (
          <g
            key={p.code}
            transform={`translate(${p.x},${p.y}) scale(${scale})`}
            className={p.headOffice ? 'home' : ''}
          >
            <title>{`${p.name}: ${p.roles.join(', ')}`}</title>
            {/* A map pin whose point sits on the country. */}
            <path className="ov-pin" d={PIN} />
            <circle className="ov-pin-dot" cx={0} cy={-15} r={3.6} />
            <text x={p.label.x} y={p.label.y} textAnchor={p.label.anchor}>
              {p.mapName}
            </text>
            <text x={p.label.x} y={p.label.y + 12} textAnchor={p.label.anchor} className="role">
              ({p.roleText})
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------- Label placement ---------- */

const LABEL_HEIGHT = 28;

// Short names on the map, as in the client's demo ("UK", "USA"); the list keeps the full names.
const SHORT_NAMES = { GB: 'UK', US: 'USA', AE: 'UAE' };

const titleCase = text => text.replace(/\b[a-z]/g, letter => letter.toUpperCase());

// Where a label can go, relative to its pin: right or left, above or below.
const SPOTS = [
  { side: 'right', y: -18 },
  { side: 'right', y: 14 },
  { side: 'left', y: -18 },
  { side: 'left', y: 14 },
];

const overlap = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/*
 * Gives every pin a label spot that covers no other pin or label and stays on the
 * map. The head office is placed first. If every spot overlaps something, the
 * spot with the least overlap is used.
 */
function placeLabels(pinned, k) {
  const ordered = [...pinned].sort((a, b) => Number(b.headOffice) - Number(a.headOffice));
  const taken = pinned.map(p => ({
    left: p.x - 10 * k,
    right: p.x + 10 * k,
    top: p.y - 26 * k,
    bottom: p.y + 2 * k,
  }));

  return ordered.map(p => {
    const roleText = titleCase(p.headOffice ? 'Head office' : p.roles.join(', '));
    const mapName = SHORT_NAMES[p.code] || p.name;
    const width = Math.max(mapName.length * 7.6, (roleText.length + 2) * 5.6);

    const options = SPOTS.map(spot => {
      // Label sizes are in screen pixels; k turns them into map units.
      const x = spot.side === 'right' ? 12 : -12;
      const box = {
        left: p.x + k * (spot.side === 'right' ? x : x - width),
        right: p.x + k * (spot.side === 'right' ? x + width : x),
        top: p.y + k * (spot.y - 12),
        bottom: p.y + k * (spot.y - 12 + LABEL_HEIGHT),
      };
      const offMap = box.left < 0 || box.right > WIDTH || box.top < 0 || box.bottom > HEIGHT ? 1e6 : 0;
      const cost = offMap + taken.reduce((sum, other) => sum + overlap(box, other), 0);
      return { cost, box, label: { x, y: spot.y, anchor: spot.side === 'right' ? 'start' : 'end' } };
    });

    const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
    taken.push(best.box);
    return { ...p, mapName, roleText, label: best.label };
  });
}

/*
 * Map units per screen pixel. Pins and labels are scaled by it, so they keep the same
 * size on screen however wide the map is drawn.
 */
function useOnScreenScale(ref) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return undefined;

    const update = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setScale(Math.round((WIDTH / width) * 100) / 100);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}
