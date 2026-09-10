import type { FoodId } from '@/types';
/** Small reusable SVG product art; no image downloads or emoji font dependency. */
export default function FoodArt({ food }: { food: FoodId }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="food-art">
      <ellipse cx="60" cy="98" rx="32" ry="6" fill="#344e42" opacity=".09" />
      {food === 'apple' && (
        <>
          <path
            d="M61 38C40 22 21 40 26 63C31 89 48 99 60 91C77 100 91 82 94 59C97 36 78 27 61 38Z"
            fill="#c86a5e"
          />
          <path
            d="M60 40Q56 24 63 16"
            fill="none"
            stroke="#745e46"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M65 27Q77 9 92 19Q82 36 65 27" fill="#75956b" />
          <path
            d="M41 43Q33 48 35 60"
            fill="none"
            stroke="#f2b5a2"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </>
      )}
      {food === 'berries' && (
        <>
          {[
            [40, 68],
            [76, 69],
            [59, 45],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="22" fill={i === 2 ? '#8b81aa' : '#70658e'} />
              <path d={`M${x - 8} ${y - 10}l5 4 4-7 3 7 5-3-4 8-8-1Z`} fill="#554c72" />
              <ellipse cx={x - 9} cy={y - 3} rx="4" ry="7" fill="#bbb0cc" opacity=".55" />
            </g>
          ))}
          <path d="M63 24Q70 9 86 19Q80 31 63 24" fill="#80966b" />
        </>
      )}
      {food === 'dumpling' && (
        <>
          <path
            d="M22 75Q33 36 61 35Q89 39 100 75Q94 97 60 98Q28 95 22 75"
            fill="#e2c49b"
            stroke="#ba956b"
            strokeWidth="2"
          />
          <path
            d="M27 72Q39 43 44 54L50 79M42 48Q51 36 57 49L60 79M59 42Q67 36 73 53L70 80M75 47Q87 51 90 72"
            fill="none"
            stroke="#f7e5c8"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </>
      )}
      {food === 'strawberry' && (
        <>
          <path d="M26 49Q27 31 59 33Q93 30 95 51Q91 79 61 99Q32 82 26 49" fill="#cb6a78" />
          <path d="M58 40L28 31 47 25 44 11 61 26 80 13 76 30 98 33 70 44 61 34Z" fill="#769569" />
          {[
            [41, 53],
            [65, 56],
            [82, 52],
            [51, 72],
            [74, 72],
            [62, 87],
          ].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="2" ry="3.5" fill="#f9deb1" />
          ))}
        </>
      )}
      {food === 'cookie' && (
        <>
          <circle cx="60" cy="59" r="36" fill="#c79a69" stroke="#ad7e53" strokeWidth="3" />
          <circle cx="59" cy="56" r="29" fill="#d8b27d" />
          {[
            [44, 42],
            [70, 37],
            [81, 63],
            [58, 70],
            [38, 72],
            [58, 52],
          ].map(([x, y], i) => (
            <rect
              key={i}
              x={x - 4}
              y={y - 4}
              width="9"
              height="8"
              rx="3"
              fill="#785342"
              transform={`rotate(${i * 31} ${x} ${y})`}
            />
          ))}
        </>
      )}
      {food === 'mochi' && (
        <>
          <ellipse cx="60" cy="81" rx="40" ry="13" fill="#e7d5c8" />
          <path d="M28 70Q27 29 60 29Q94 29 92 70Q90 90 60 91Q30 90 28 70" fill="#d7a6b9" />
          <path
            d="M40 48Q45 36 57 38"
            fill="none"
            stroke="#f5d8e3"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="77" cy="73" r="2" fill="#edcbd8" />
          <circle cx="44" cy="77" r="2" fill="#edcbd8" />
        </>
      )}
    </svg>
  );
}
