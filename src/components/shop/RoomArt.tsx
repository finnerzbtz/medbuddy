import type { RoomItemId, RoomStyle } from '@/types';
import { roomItem } from '@/domain/room';

export default function RoomArt({ item }: { item: RoomItemId }) {
  const slot = roomItem(item)!.slot;
  return (
    <svg
      width="160"
      height="150"
      viewBox="0 0 160 150"
      className="room-product-art"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="80" cy="132" rx="47" ry="7" fill="#344e42" opacity=".08" />
      {slot === 'lamp' && (
        <>
          <ellipse cx="80" cy="123" rx="30" ry="8" fill="#b28b61" />
          {item === 'paper_lamp' ? (
            <>
              <path d="M59 111L59 124Q80 133 101 124L101 111Z" fill="#9f805c" />
              <ellipse cx="80" cy="83" rx="32" ry="38" fill="#f2d5a0" />
              <path
                d="M64 58Q56 86 66 103"
                fill="none"
                stroke="#fff3d6"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          ) : item === 'lava_lamp' ? (
            <>
              <path d="M60 126L67 110H93L100 126Z" fill="#a48965" />
              <path
                d="M67 110L57 72L74 29H86L103 72L93 110Z"
                fill="#c1b5dd"
                stroke="#8b7ea8"
                strokeWidth="2"
              />
              <path d="M74 29L80 13L86 29Z" fill="#a48965" />
              <ellipse cx="78" cy="89" rx="14" ry="18" fill="#c079b6" />
              <ellipse cx="81" cy="52" rx="8" ry="12" fill="#e6a1ca" />
              <circle cx="70" cy="71" r="6" fill="#e6a1ca" />
              <path d="M69 42L63 64" stroke="#ece5f8" strokeWidth="4" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M68 73L64 121Q80 128 96 121L92 73Z" fill="#ede2bf" />
              <path d="M29 79Q35 32 80 29Q124 32 132 79Q82 98 29 79Z" fill="#dcb064" />
              <ellipse cx="80" cy="80" rx="48" ry="9" fill="#edce91" />
              <ellipse cx="60" cy="53" rx="9" ry="5" fill="#fbedd0" />
              <ellipse cx="98" cy="62" rx="11" ry="6" fill="#fbedd0" />
            </>
          )}
        </>
      )}
      {slot === 'garden' &&
        (item === 'bonsai' ? (
          <>
            <path d="M50 105L57 127Q80 136 104 127L111 105Z" fill="#bd9480" />
            <ellipse cx="80" cy="105" rx="30" ry="8" fill="#7c6c60" />
            <path d="M78 104Q66 77 89 68L76 43" fill="none" stroke="#a08662" strokeWidth="8" />
            {[
              ['55', '68'],
              ['94', '61'],
              ['70', '36'],
              ['106', '35'],
            ].map(([cx, cy], i) => (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx="26"
                ry="15"
                fill={i % 2 ? '#89a77c' : '#a6bd92'}
              />
            ))}
          </>
        ) : (
          <>
            <path d="M25 63L116 47L143 106L51 126L25 108Z" fill="#b98d59" />
            <path d="M28 63L116 50L138 101L51 119Z" fill="#e7d4a8" />
            {[0, 1, 2].map((i) => (
              <ellipse
                key={i}
                cx="78"
                cy="85"
                rx={19 + i * 8}
                ry={10 + i * 5}
                fill="none"
                stroke="#c8b78e"
                strokeWidth="2"
              />
            ))}
            <ellipse cx="78" cy="83" rx="14" ry="9" fill="#7e8e85" />
            <ellipse cx="114" cy="97" rx="9" ry="6" fill="#a1ac9d" />
            <path
              d="M37 46L54 96M43 91L66 83"
              stroke="#997b50"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ))}
      {slot === 'table' && (
        <>
          <path d="M32 87V126M125 84V126" stroke="#b89b79" strokeWidth="8" strokeLinecap="round" />
          <path d="M19 84L102 66L143 89L59 108Z" fill="#d8bea0" />
          {item === 'tea_set' ? (
            <>
              <ellipse cx="74" cy="84" rx="23" ry="7" fill="#e5e6d6" />
              <path d="M56 57L59 80Q72 92 85 80L88 57Z" fill="#f4f1de" />
              <ellipse cx="72" cy="57" rx="16" ry="5" fill="#ac9169" />
              <path d="M86 62Q111 55 98 76L87 78" fill="none" stroke="#e8e8d8" strokeWidth="5" />
              <path
                d="M69 42Q60 33 72 24M81 42Q72 33 84 24"
                fill="none"
                stroke="#b4c5ba"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path d="M34 59L101 48L130 76V88L63 100L34 82Z" fill="#9c8dad" />
              <path d="M34 59L101 48L130 76L63 88Z" fill="#ddd6dc" />
              <ellipse cx="76" cy="65" rx="25" ry="13" fill="#354b4c" />
              <ellipse cx="76" cy="65" rx="9" ry="5" fill="#e6b76c" />
              <path
                d="M106 55L114 73L99 78"
                fill="none"
                stroke="#a08456"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M112 28V43Q101 48 101 41Q101 36 109 37M113 30L127 25V38Q116 43 116 36Q117 32 123 33"
                fill="none"
                stroke="#8b77a6"
                strokeWidth="3"
              />
            </>
          )}
        </>
      )}
      {slot === 'view' && (
        <>
          <circle cx="80" cy="75" r="57" fill="#a7c9d2" stroke="#cfb696" strokeWidth="9" />
          <circle cx="104" cy="48" r="11" fill="#f1d6a2" />
          {item === 'coast_view' ? (
            <>
              <path d="M25 83H135Q121 127 80 131Q38 123 25 83Z" fill="#73aeb5" />
              <path
                d="M43 101Q62 94 81 102T119 103M59 117H104"
                fill="none"
                stroke="#bde0d5"
                strokeWidth="3"
              />
              <path d="M64 88H85L80 95H69Z" fill="#977f66" />
              <path d="M73 84V59L58 84Z" fill="#fff5d7" />
            </>
          ) : item === 'mountain_view' ? (
            <>
              <path d="M29 99L63 45L104 119Q66 141 29 99" fill="#899cae" />
              <path d="M56 58L63 45L76 64L65 61Z" fill="#f2f3e8" />
              <path d="M60 120L99 65L132 104Q104 137 60 120" fill="#658d85" />
              <path d="M89 80L99 65L110 78L100 76Z" fill="#f2f3e8" />
            </>
          ) : (
            <>
              <path
                d="M25 88Q50 55 82 91Q112 68 135 86Q121 132 80 132Q40 126 25 88"
                fill="#a4b78d"
              />
              <path
                d="M56 106V40M67 112V34M45 100V54M44 66L66 78M56 81L80 68M50 89L69 100"
                stroke="#6f927d"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      )}
    </svg>
  );
}
export function RoomStill({ room, name }: { room: RoomStyle; name: string }) {
  return (
    <div
      className="room-still"
      role="img"
      aria-label={`${name}’s room: ${Object.values(room)
        .map((id) => roomItem(id)!.name)
        .join(', ')}.`}
    >
      <svg viewBox="0 0 420 360" aria-hidden="true">
        <path d="M18 99L211 16L403 99V276L211 349L18 275Z" fill="#e5e5d9" />
        <path d="M211 16V196L18 275V99Z" fill="#ccd6c8" />
        <path d="M18 275L211 196L403 276L211 349Z" fill="#b7c9b9" />
        <path
          d="M211 196L211 348M114 235L310 311M310 236L114 311"
          fill="none"
          stroke="#e0ddc6"
          strokeWidth="2"
        />
        <g transform="translate(222 38) scale(.92)">
          <RoomArt item={room.view} />
        </g>
        <g transform="translate(35 125) scale(.9)">
          <RoomArt item={room.garden} />
        </g>
        <g transform="translate(47 225) scale(.83)">
          <RoomArt item={room.table} />
        </g>
        <g transform="translate(291 158) scale(.78)">
          <RoomArt item={room.lamp} />
        </g>
        <ellipse cx="235" cy="297" rx="43" ry="12" fill="#96ae99" />
        <path
          d="M193 279C183 223 200 191 236 190C271 190 286 239 272 278Q237 305 193 279Z"
          fill="#fff8e8"
          stroke="#d4d7c8"
          strokeWidth="2"
        />
        <ellipse cx="219" cy="237" rx="4" ry="6" fill="#334943" />
        <ellipse cx="246" cy="237" rx="4" ry="6" fill="#334943" />
      </svg>
    </div>
  );
}
