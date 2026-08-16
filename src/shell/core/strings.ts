/**
 * The string catalogue.
 *
 * Every user-visible string in the shell, plus every message the finished game already
 * produces, in English and in Hong Kong Cantonese, at all five funny levels.
 *
 *   1  plain and factual — the wording you would put in a manual
 *   2  plain, but human
 *   3  warm — the house voice
 *   4  cheeky
 *   5  theatrical, and very funny
 *
 * ABSOLUTE RULE: every level of every key contains exactly the same set of `{parameter}`
 * placeholders. The voice changes; the facts never do. A price, a count, a crop name, a
 * key binding, a file path and an error code read identically at level 1 and at level 5,
 * because they are never written into the string — they are interpolated into it.
 * `placeholdersOf()` below is the function the test uses to prove it.
 *
 * The Cantonese is written the way a Hong Kong speaker actually texts — traditional
 * characters, spoken-Cantonese particles, the odd English word left in because that is
 * how people really talk — not a stiff transliteration of the English line above it.
 *
 * No imports, by design: this file must be readable by a plain script.
 */

/** The five voices of one language, indexed by funny level minus one. */
export type LevelVoices = readonly [string, string, string, string, string]

export interface StringEntry {
  readonly en: LevelVoices
  readonly yue: LevelVoices
}

/** `{name}`, `{count}`, `{error_code}`. Nothing else counts as a placeholder. */
const PLACEHOLDER_RE = /\{([A-Za-z0-9_]+)\}/g

/** The placeholder names in `text`, sorted and de-duplicated. Used by the parity test. */
export function placeholdersOf(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PLACEHOLDER_RE)) found.add(match[1])
  return [...found].sort()
}

/**
 * The catalogue proper. `STRINGS` at the foot of the file is this plus the extras and the
 * aliases, so a key defined here can be re-published under a second name for free and the
 * two can never drift apart.
 */
const CORE = {
  // =========================================================================
  // common — shared verbs and nouns for every surface
  // =========================================================================

  'common.ok': {
    en: ['OK', 'OK', 'OK', 'OK', 'OK'],
    yue: ['OK', 'OK', 'OK', 'OK', 'OK'],
  },
  'common.cancel': {
    en: ['Cancel', 'Cancel', 'Never mind', 'Nope, back out', 'Abort the whole affair'],
    yue: ['取消', '取消', '算數', '唔好啦，走先', '收皮，唔玩喇'],
  },
  'common.close': {
    en: ['Close', 'Close', 'Close it', 'Shut it', 'Draw the curtain'],
    yue: ['關閉', '閂咗佢', '閂咗佢先', '閂窗啦唔該', '落幕啦，多謝各位'],
  },
  'common.save': {
    en: ['Save', 'Save', 'Save it', 'Lock it in', 'Commit it to the ages'],
    yue: ['儲存', '儲存', '儲低佢', '收好佢', '刻落石碑，萬世流芳'],
  },
  'common.apply': {
    en: ['Apply', 'Apply', 'Apply it', 'Make it so', 'Let it be written'],
    yue: ['套用', '套用', '用落去', '就咁話', '一聲令下，即刻生效'],
  },
  'common.reset': {
    en: ['Reset', 'Reset', 'Put it back', 'Back to how it was', 'Rewind time itself'],
    yue: ['重設', '重設', '還原返', '打返原形', '時光倒流，當乜都冇發生過'],
  },
  'common.yes': {
    en: ['Yes', 'Yes', 'Yes please', 'Go on then', 'Yes, and hurry'],
    yue: ['係', '係呀', '好呀', '得，去啦', '梗係啦，仲唔快啲'],
  },
  'common.no': {
    en: ['No', 'No', 'No thanks', 'Rather not', 'Absolutely not, thank you'],
    yue: ['唔係', '唔係', '唔使喇，唔該', '唔想喎', '死都唔制，多謝'],
  },
  'common.search': {
    en: ['Search', 'Search', 'Search', 'Go find it', 'Summon what you seek'],
    yue: ['搜尋', '搜尋', '搵嘢', '幫你搵', '一聲令下，包搵到'],
  },
  'common.clear': {
    en: ['Clear', 'Clear', 'Clear it', 'Wipe it', 'Erase every trace'],
    yue: ['清除', '清除', '清走佢', '抹晒佢', '一鋪清袋，乾乾淨淨'],
  },
  'common.copy': {
    en: ['Copy', 'Copy', 'Copy it', 'Grab a copy', 'Duplicate it for posterity'],
    yue: ['複製', '複製', 'copy 一份', '抄低佢', '影印萬世，流傳千古'],
  },
  'common.copied': {
    en: ['Copied', 'Copied', 'Copied to the clipboard', 'Got it — it is on your clipboard', 'Copied! It lives in your clipboard now'],
    yue: ['已複製', '複製咗喇', '已經 copy 咗落剪貼簿', '搞掂，喺你 clipboard 度', '複製完成！而家佢住喺你剪貼簿度喇'],
  },
  'common.none': {
    en: ['None', 'None', 'Nothing here', 'Nothing at all', 'A beautiful, echoing emptiness'],
    yue: ['冇', '冇嘢', '乜都冇', '一啲都冇', '空空如也，得個吉字'],
  },
  'common.loading': {
    en: ['Loading', 'Loading', 'Loading…', 'One moment…', 'Fetching it from the back room…'],
    yue: ['載入中', '載入緊', '載入緊…', '等陣先…', '入緊倉攞緊嘢，等我一陣…'],
  },
  'common.retry': {
    en: ['Retry', 'Try again', 'Try again', 'Give it another go', 'Once more, with feeling'],
    yue: ['重試', '再試', '再試多次', '再嚟過啦', '再嚟一次，今次落多啲感情'],
  },
  'common.back': {
    en: ['Back', 'Back', 'Go back', 'Back you go', 'Retreat, gracefully'],
    yue: ['返回', '返去', '返返去', '行返轉頭', '優雅地撤退'],
  },
  'common.more': {
    en: ['{count} more', '{count} more', '{count} more', '{count} more waiting', '{count} more, patiently queueing'],
    yue: ['仲有 {count} 個', '仲有 {count} 個', '仲有 {count} 個喺度', '仲有 {count} 個等緊', '仲有 {count} 個排住隊等你臨幸'],
  },
  'common.on': {
    en: ['On', 'On', 'On', 'Switched on', 'Gloriously on'],
    yue: ['開', '開咗', '開咗', '着咗喇', '火力全開'],
  },
  'common.off': {
    en: ['Off', 'Off', 'Off', 'Switched off', 'Silent and dark'],
    yue: ['閂', '閂咗', '閂咗', '熄咗喇', '烏燈黑火，靜英英'],
  },
  'common.default': {
    en: ['Default', 'Default', 'The default', 'As it comes', 'Exactly as the maker intended'],
    yue: ['預設', '預設', '預設嗰個', '原裝嗰個', '原汁原味，出廠設定'],
  },
  'common.custom': {
    en: ['Custom', 'Custom', 'Your own', 'Your own version', 'Your own, and nobody else has it'],
    yue: ['自訂', '自訂', '你自己嗰個', '你改過嗰個', '你獨家訂造，全世界得你一個'],
  },
  'common.expand': {
    en: ['Expand', 'Expand', 'Open it up', 'Open it up', 'Unfurl it'],
    yue: ['展開', '展開', '打開佢', '攤開佢睇', '隆重展開，請慢慢欣賞'],
  },
  'common.collapse': {
    en: ['Collapse', 'Collapse', 'Fold it away', 'Tuck it away', 'Fold it up and tuck it in'],
    yue: ['收埋', '收埋', '摺埋佢', '摺埋收好', '摺得靚靚哋，收埋佢'],
  },
  'common.enabled': {
    en: ['Enabled', 'Enabled', 'Turned on', 'On and working', 'Alive, awake and working'],
    yue: ['已啟用', '已啟用', '開咗，用得', '開咗喇，運作緊', '生猛活潑，運作中'],
  },
  'common.disabled': {
    en: ['Disabled', 'Disabled', 'Turned off', 'Off for now', 'Fast asleep, for now'],
    yue: ['已停用', '已停用', '閂咗', '暫時閂咗', '瞓緊覺，暫時唔理你'],
  },
  'common.count': {
    en: ['{count}', '{count}', '{count}', '{count}', '{count}'],
    yue: ['{count}', '{count}', '{count}', '{count}', '{count}'],
  },
  'common.error': {
    en: ['Error: {error}', 'Error: {error}', 'Something went wrong: {error}', 'That did not work: {error}', 'Disaster, and it says: {error}'],
    yue: ['錯誤：{error}', '錯誤：{error}', '出咗事：{error}', '搞唔掂喎：{error}', '大鑊，佢話：{error}'],
  },
  'common.error.code': {
    en: ['Error {code}: {error}', 'Error {code}: {error}', 'Something went wrong — {code}: {error}', 'That failed, code {code}: {error}', 'Catastrophe number {code}, and it reads: {error}'],
    yue: ['錯誤 {code}：{error}', '錯誤 {code}：{error}', '出咗事，代碼 {code}：{error}', '失敗咗，code {code}：{error}', '第 {code} 號大災難，內容係：{error}'],
  },
  'common.unsaved': {
    en: ['Unsaved changes', 'Unsaved changes', 'You have unsaved changes', 'There is work here you have not saved', 'Unsaved work, hanging by a thread'],
    yue: ['未儲存嘅改動', '有嘢未儲存', '你有啲嘢未儲存喎', '呢度有嘢未儲低', '有心血未儲存，命懸一線'],
  },
  'common.dragHandle': {
    en: ['Drag handle', 'Drag handle', 'Grab here to move it', 'Grab here to move it', 'Grab here and drag it wherever you like'],
    yue: ['拖拉手掣', '拖拉手掣', '喺呢度拉住郁佢', '捉住呢度拖啦', '捉實呢度，拖去邊都得'],
  },

  // =========================================================================
  // application chrome — title bar and window controls
  // =========================================================================

  'app.name': {
    en: ['Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow'],
    yue: ['芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow'],
  },
  'app.tagline': {
    en: [
      'A farm at the bottom of a wooded valley.',
      'A small farm at the bottom of a wooded valley.',
      'A quiet farm at the bottom of a wooded valley.',
      'One farm, one valley, and nobody rushing you.',
      'A hush of a valley, a rusty hoe, and a whole year to prove yourself.',
    ],
    yue: [
      '樹林山谷底下嘅一個農場。',
      '樹林山谷底下嘅一個小農場。',
      '喺山谷底靜靜哋耕住嘅一片田。',
      '一個山谷，一塊田，冇人催你。',
      '靜到得蟬聲嘅山谷、一把生晒鏽嘅鋤頭，同埋成年時間畀你揚眉吐氣。',
    ],
  },
  'app.window.label': {
    en: ['Sprout Hollow window', 'Sprout Hollow window', 'The Sprout Hollow window', 'The Sprout Hollow window', 'The Sprout Hollow window itself'],
    yue: ['Sprout Hollow 視窗', 'Sprout Hollow 視窗', 'Sprout Hollow 個窗', 'Sprout Hollow 呢個窗', 'Sprout Hollow 本尊呢個窗'],
  },
  'titlebar.label': {
    en: ['Title bar', 'Title bar', 'Title bar', 'The title bar', 'The title bar, keeper of the window'],
    yue: ['標題列', '標題列', '標題列', '上面條標題列', '標題列，守住成個窗嘅門神'],
  },
  'titlebar.dragHint': {
    en: ['Drag to move the window', 'Drag to move the window', 'Drag here to move the window', 'Grab here and the window follows', 'Take hold and the whole window comes with you'],
    yue: ['拖住可以搬個窗', '拖住可以搬個窗', '喺呢度拖，就搬到個窗', '捉住呢度，個窗跟你走', '捉實呢度，成個窗都跟你去天涯海角'],
  },
  'titlebar.minimise': {
    en: ['Minimise', 'Minimise', 'Minimise', 'Tuck it away', 'Vanish it to the taskbar'],
    yue: ['縮到最細', '縮細佢', '縮細佢', '收埋佢先', '一秒隱形，走去工作列匿埋'],
  },
  'titlebar.maximise': {
    en: ['Maximise', 'Maximise', 'Fill the screen', 'Take the whole screen', 'Seize the entire screen'],
    yue: ['最大化', '放到最大', '霸晒成個 mon', '成個 mon 都係你嘅', '一鋪過霸晒成塊 mon，唔好客氣'],
  },
  'titlebar.restore': {
    en: ['Restore', 'Restore', 'Back to a window', 'Shrink back to a window', 'Return it to a modest little window'],
    yue: ['還原', '還原', '變返個窗', '縮返做細窗', '謙虛啲，變返個細細嘅窗仔'],
  },
  'titlebar.close': {
    en: ['Close', 'Close', 'Close the window', 'Close the window', 'Close the window and end the day'],
    yue: ['關閉', '閂窗', '閂咗個窗', '閂窗收工', '閂窗收工，今日到此為止'],
  },
  'titlebar.doubleClickHint': {
    en: ['Double-click to maximise', 'Double-click to maximise', 'Double-click to fill the screen', 'Double-click and it takes the screen', 'Double-click and watch it swallow the screen'],
    yue: ['㩒兩下放到最大', '㩒兩下放到最大', '㩒兩下就霸晒成個 mon', '㩒兩下，佢就霸晒塊 mon', '㩒兩下，睇住佢一啖吞晒成塊 mon'],
  },
  'titlebar.documentTitle': {
    en: ['{tab} — {app}', '{tab} — {app}', '{tab} — {app}', '{tab} — {app}', '{tab} — {app}'],
    yue: ['{tab} — {app}', '{tab} — {app}', '{tab} — {app}', '{tab} — {app}', '{tab} — {app}'],
  },

  // =========================================================================
  // tabs
  // =========================================================================

  'tabs.strip.label': {
    en: ['Tabs', 'Tabs', 'Your tabs', 'Your tabs', 'Your tabs, all lined up'],
    yue: ['分頁', '分頁', '你啲分頁', '你啲分頁', '你班分頁，排到成行'],
  },
  'tabs.panel.label': {
    en: ['{title} panel', '{title} panel', 'The {title} panel', 'The {title} panel', 'The {title} panel, in all its glory'],
    yue: ['{title} 面板', '{title} 面板', '{title} 呢版嘢', '{title} 呢一版', '{title} 呢一版，隆重登場'],
  },
  'tabs.new': {
    en: ['New tab', 'New tab', 'Open a new tab', 'Open a fresh tab', 'Open a brand new tab, still warm'],
    yue: ['新分頁', '開新分頁', '開個新分頁', '開返個新分頁', '開個全新分頁，仲熱辣辣'],
  },
  'tabs.close': {
    en: ['Close {title}', 'Close {title}', 'Close {title}', 'Close {title}', 'Close {title} and say goodbye'],
    yue: ['閂 {title}', '閂咗 {title}', '閂咗 {title} 佢', '閂咗 {title} 佢啦', '閂咗 {title}，講聲拜拜'],
  },
  'tabs.closeOthers': {
    en: ['Close other tabs', 'Close the other tabs', 'Close every other tab', 'Close everything except this one', 'Close everything else and leave this one standing'],
    yue: ['閂其他分頁', '閂晒其他分頁', '其他分頁全部閂晒', '除咗呢個，其他全部閂', '除咗呢個生還者，其他全部清場'],
  },
  'tabs.closeRight': {
    en: ['Close tabs to the right', 'Close the tabs to the right', 'Close everything to the right', 'Sweep away everything on the right', 'Sweep the entire right flank into the sea'],
    yue: ['閂右邊嘅分頁', '閂晒右邊啲分頁', '右邊嗰啲全部閂', '右邊嗰堆掃晒佢', '右邊嗰條防線，一鋪過掃落海'],
  },
  'tabs.closeAll': {
    en: ['Close all tabs', 'Close all the tabs', 'Close every tab', 'Close the lot', 'Close every last one of them'],
    yue: ['閂晒所有分頁', '閂晒所有分頁', '全部分頁閂晒', '成籠嘢閂晒佢', '一個都唔留，全部閂晒'],
  },
  'tabs.pin': {
    en: ['Pin {title}', 'Pin {title}', 'Pin {title} to the front', 'Pin {title} so it stays put', 'Nail {title} to the front so it never wanders'],
    yue: ['釘住 {title}', '釘住 {title}', '將 {title} 釘喺最前', '釘實 {title}，唔好走', '將 {title} 釘到實一實，永世唔准走'],
  },
  'tabs.unpin': {
    en: ['Unpin {title}', 'Unpin {title}', 'Let {title} go free', 'Let {title} roam again', 'Release {title} back into the wild'],
    yue: ['解除釘住 {title}', '唔釘住 {title}', '放返 {title} 自由', '放 {title} 出嚟行下', '放生 {title}，返返大自然'],
  },
  'tabs.pinned.badge': {
    en: ['Pinned', 'Pinned', 'Pinned', 'Pinned in place', 'Pinned, and not going anywhere'],
    yue: ['已釘住', '釘咗', '釘實咗', '釘到實一實', '釘到實一實，郁都郁唔到'],
  },
  'tabs.duplicate': {
    en: ['Duplicate {title}', 'Duplicate {title}', 'Make a copy of {title}', 'Clone {title}', 'Conjure a second {title} out of thin air'],
    yue: ['複製 {title}', '複製 {title}', '整多個 {title}', 'Clone 多個 {title}', '憑空變多個 {title} 出嚟'],
  },
  'tabs.rename': {
    en: ['Rename {title}', 'Rename {title}', 'Give {title} a new name', 'Call {title} something else', 'Christen {title} anew'],
    yue: ['重新命名 {title}', '改 {title} 個名', '幫 {title} 改個名', '畀個新名 {title}', '隆重同 {title} 改個新名'],
  },
  'tabs.moveLeft': {
    en: ['Move {title} left', 'Move {title} left', 'Shift {title} left', 'Nudge {title} to the left', 'Escort {title} one step to the left'],
    yue: ['將 {title} 移向左', '將 {title} 移左', '{title} 推左啲', '{title} 郁左少少', '請 {title} 向左行一步'],
  },
  'tabs.moveRight': {
    en: ['Move {title} right', 'Move {title} right', 'Shift {title} right', 'Nudge {title} to the right', 'Escort {title} one step to the right'],
    yue: ['將 {title} 移向右', '將 {title} 移右', '{title} 推右啲', '{title} 郁右少少', '請 {title} 向右行一步'],
  },
  'tabs.reorder.hint': {
    en: [
      'Reorder with {keys}.',
      'Reorder with {keys}.',
      'Drag them, or reorder with {keys}.',
      'Drag them about, or use {keys} if you prefer the keyboard.',
      'Drag them, or press {keys} and watch them shuffle like an obedient chorus line.',
    ],
    yue: [
      '用 {keys} 調位。',
      '用 {keys} 調位。',
      '拖佢哋，或者用 {keys} 調位。',
      '想拖就拖，鍾意用鍵盤就撳 {keys}。',
      '拖都得，撳 {keys} 都得，睇住佢哋好似排舞咁自動歸位。',
    ],
  },
  'tabs.reordered': {
    en: ['{title} moved to position {position}', '{title} moved to position {position}', '{title} is now at position {position}', '{title} has shuffled to position {position}', '{title} has swept grandly into position {position}'],
    yue: ['{title} 移咗去第 {position} 位', '{title} 移咗去第 {position} 位', '{title} 而家喺第 {position} 位', '{title} 蛇餅咁扭咗去第 {position} 位', '{title} 華麗轉身，登上第 {position} 位'],
  },
  'tabs.overflow': {
    en: ['{count} more tabs', '{count} more tabs', '{count} more tabs over here', '{count} more tabs hiding here', '{count} more tabs, crammed in and waiting'],
    yue: ['仲有 {count} 個分頁', '仲有 {count} 個分頁', '呢邊仲有 {count} 個分頁', '呢度仲匿埋咗 {count} 個分頁', '仲有 {count} 個分頁迫喺度等出場'],
  },
  'tabs.overflow.label': {
    en: ['Tabs that do not fit', 'Tabs that do not fit', 'The tabs that did not fit', 'The tabs that could not squeeze in', 'The poor tabs that could not squeeze in'],
    yue: ['擺唔落嘅分頁', '擺唔落嘅分頁', '擺唔落嗰啲分頁', '迫唔入嗰啲分頁', '可憐嗰班迫唔入嘅分頁'],
  },
  'tabs.scrollLeft': {
    en: ['Scroll tabs left', 'Scroll tabs left', 'Scroll the tabs left', 'Slide the tabs left', 'Send the tabs sliding leftward'],
    yue: ['向左捲分頁', '分頁向左捲', '啲分頁向左捲', '啲分頁滑左啲', '一推之下，啲分頁向左滑走'],
  },
  'tabs.scrollRight': {
    en: ['Scroll tabs right', 'Scroll tabs right', 'Scroll the tabs right', 'Slide the tabs right', 'Send the tabs sliding rightward'],
    yue: ['向右捲分頁', '分頁向右捲', '啲分頁向右捲', '啲分頁滑右啲', '一推之下，啲分頁向右滑走'],
  },
  'tabs.group.new': {
    en: ['New group', 'New group', 'Start a new group', 'Start a new group', 'Found a whole new group'],
    yue: ['新群組', '開新群組', '開個新群組', '開返個新群組', '隆重成立一個全新群組'],
  },
  'tabs.group.name.label': {
    en: ['Group name', 'Group name', 'Name of the group', 'What is this group called?', 'What shall we call this noble group?'],
    yue: ['群組名', '群組名', '群組個名', '呢組叫咩名好？', '呢個尊貴嘅群組，叫咩名好呢？'],
  },
  'tabs.group.rename': {
    en: ['Rename group {group}', 'Rename group {group}', 'Give group {group} a new name', 'Call group {group} something else', 'Christen group {group} anew'],
    yue: ['重新命名群組 {group}', '改群組 {group} 個名', '幫群組 {group} 改個名', '畀個新名群組 {group}', '隆重同群組 {group} 改個新名'],
  },
  'tabs.group.collapse': {
    en: ['Collapse group {group}', 'Collapse group {group}', 'Fold group {group} away', 'Tuck group {group} away', 'Fold group {group} up neatly and tuck it in'],
    yue: ['收埋群組 {group}', '收埋群組 {group}', '摺埋群組 {group}', '摺埋群組 {group} 先', '將群組 {group} 摺到靚靚哋，收埋佢'],
  },
  'tabs.group.expand': {
    en: ['Expand group {group}', 'Expand group {group}', 'Open group {group} up', 'Open group {group} back up', 'Unfurl group {group} in all its glory'],
    yue: ['展開群組 {group}', '展開群組 {group}', '打開群組 {group}', '打返開群組 {group}', '隆重展開群組 {group}，請慢慢欣賞'],
  },
  'tabs.group.addTo': {
    en: ['Add {title} to group {group}', 'Add {title} to group {group}', 'Put {title} into group {group}', 'Pop {title} into group {group}', 'Usher {title} into the ranks of group {group}'],
    yue: ['將 {title} 加入群組 {group}', '將 {title} 加入群組 {group}', '擺 {title} 入群組 {group}', '掟 {title} 入群組 {group}', '恭請 {title} 加入群組 {group} 嘅行列'],
  },
  'tabs.group.remove': {
    en: ['Remove {title} from group {group}', 'Remove {title} from group {group}', 'Take {title} out of group {group}', 'Pull {title} out of group {group}', 'Extract {title} from group {group}, gently'],
    yue: ['將 {title} 由群組 {group} 移走', '將 {title} 由群組 {group} 移走', '將 {title} 抽返出群組 {group}', '將 {title} 由群組 {group} 拉返出嚟', '溫柔咁將 {title} 由群組 {group} 度救返出嚟'],
  },
  'tabs.group.count': {
    en: ['{group}: {count} tabs', '{group}: {count} tabs', '{group} holds {count} tabs', '{group} is looking after {count} tabs', '{group} presides over {count} loyal tabs'],
    yue: ['{group}：{count} 個分頁', '{group}：{count} 個分頁', '{group} 入面有 {count} 個分頁', '{group} 照住 {count} 個分頁', '{group} 大人麾下，有 {count} 個忠心分頁'],
  },
  'tabs.group.label': {
    en: ['Tab group {group}', 'Tab group {group}', 'Tab group {group}', 'The {group} group', 'The noble tab group {group}'],
    yue: ['分頁群組 {group}', '分頁群組 {group}', '分頁群組 {group}', '{group} 呢組', '尊貴嘅分頁群組 {group}'],
  },
  'tabs.unsaved.title': {
    en: ['Close {title}?', 'Close {title}?', 'Close {title} anyway?', 'Really close {title}?', 'Truly, madly, close {title}?'],
    yue: ['閂 {title}？', '閂 {title}？', '照閂 {title}？', '真係閂 {title}？', '真心誠意，決定閂 {title}？'],
  },
  'tabs.unsaved.body': {
    en: [
      '{title} has unsaved work. Closing it discards the changes.',
      '{title} has unsaved work. Closing it discards the changes.',
      '{title} has work you have not saved. Close it and the changes go.',
      '{title} has unsaved work, and closing it throws that work away.',
      '{title} is clutching unsaved work. Close it and that work is gone forever, unmourned.',
    ],
    yue: [
      '{title} 有嘢未儲存。閂咗就會冇咗啲改動。',
      '{title} 有嘢未儲存。閂咗就會冇咗啲改動。',
      '{title} 有啲嘢未儲低，閂咗就冇晒。',
      '{title} 仲有嘢未儲存，閂咗即係掉晒佢。',
      '{title} 抱住啲未儲存嘅心血。一閂，血本無歸，仲要冇人拜山。',
    ],
  },
  'tabs.unsaved.discard': {
    en: ['Close without saving', 'Close without saving', 'Close and lose the changes', 'Close it, changes and all', 'Close it and let the changes perish'],
    yue: ['唔儲存直接閂', '唔儲存直接閂', '閂咗佢，改動唔要', '照閂，啲改動當冇到', '照閂，啲改動就等佢化為烏有'],
  },
  'tabs.unsaved.keep': {
    en: ['Keep it open', 'Keep it open', 'Leave it open', 'Leave it be', 'Leave it open and breathing'],
    yue: ['留返開住', '留返開住', '唔好閂住', '由得佢啦', '留返佢開住，唞下氣'],
  },
  'tabs.closed': {
    en: ['Closed {title}', 'Closed {title}', 'Closed {title}', '{title} is gone', '{title} has left the building'],
    yue: ['閂咗 {title}', '閂咗 {title}', '閂咗 {title} 喇', '{title} 走咗喇', '{title} 已經退場，多謝欣賞'],
  },
  'tabs.reopen': {
    en: ['Reopen {title}', 'Reopen {title}', 'Bring {title} back', 'Bring {title} back', 'Resurrect {title} from the void'],
    yue: ['重開 {title}', '重開 {title}', '叫返 {title} 返嚟', '叫返 {title} 返嚟啦', '由陰間召返 {title} 上嚟'],
  },
  'tabs.empty': {
    en: ['No tabs are open.', 'No tabs are open.', 'Nothing is open right now.', 'Not a single tab open.', 'Not one tab open. The silence is deafening.'],
    yue: ['冇分頁開住。', '冇分頁開住。', '而家乜都冇開。', '一個分頁都冇開喎。', '一個分頁都冇，靜到聽到自己心跳。'],
  },

  // =========================================================================
  // tab searches and bulk close
  // =========================================================================

  'search.tabs.strip.label': {
    en: ['Search this tab strip', 'Search this tab strip', 'Search the tabs on this strip', 'Hunt through the tabs on this strip', 'Interrogate every tab on this strip'],
    yue: ['搜尋呢條分頁列', '搜尋呢條分頁列', '搵下呢條分頁列入面啲分頁', '喺呢條分頁列度掘下', '將呢條分頁列上面每個分頁盤問一次'],
  },
  'search.tabs.strip.placeholder': {
    en: ['Search tabs', 'Search tabs', 'Search tabs', 'Which tab are you after?', 'Name the tab and it shall appear'],
    yue: ['搜尋分頁', '搜尋分頁', '搵分頁', '你想搵邊個分頁？', '講個名出嚟，佢就自動現身'],
  },
  'search.tabs.group.label': {
    en: ['Search tabs in group {group}', 'Search tabs in group {group}', 'Search the tabs inside group {group}', 'Hunt through group {group}', 'Interrogate every tab inside group {group}'],
    yue: ['搜尋群組 {group} 入面嘅分頁', '搜尋群組 {group} 入面嘅分頁', '搵下群組 {group} 入面啲分頁', '喺群組 {group} 度掘下', '將群組 {group} 入面每個分頁盤問一次'],
  },
  'search.tabs.group.placeholder': {
    en: ['Search in {group}', 'Search in {group}', 'Search inside {group}', 'What are you after in {group}?', 'Name it and {group} will hand it over'],
    yue: ['喺 {group} 入面搵', '喺 {group} 入面搵', '喺 {group} 入面搵嘢', '喺 {group} 度想搵咩？', '講個名出嚟，{group} 即刻交人'],
  },
  'search.tabs.groupNames.label': {
    en: ['Search group names', 'Search group names', 'Search the names of the groups', 'Hunt through the group names', 'Interrogate the group names themselves'],
    yue: ['搜尋群組名', '搜尋群組名', '搵群組個名', '喺啲群組名度掘下', '連班群組嘅名都要查一查'],
  },
  'search.tabs.groupNames.placeholder': {
    en: ['Search groups', 'Search groups', 'Search groups', 'Which group?', 'Which group, out of all of them?'],
    yue: ['搜尋群組', '搜尋群組', '搵群組', '邊個群組？', '咁多個群組，你要邊個？'],
  },
  'search.tabs.all.label': {
    en: ['Search all tabs', 'Search all open tabs', 'Search every tab in the app', 'Hunt through every tab in the app', 'Interrogate every last tab this app owns'],
    yue: ['搜尋所有分頁', '搜尋所有開住嘅分頁', '搵勻成個 app 嘅分頁', '將成個 app 嘅分頁掘一次', '成個 app 嘅分頁，一個都唔放過'],
  },
  'search.tabs.all.placeholder': {
    en: ['Search all tabs', 'Search all tabs', 'Search everywhere', 'Search absolutely everywhere', 'Search every corner of every tab'],
    yue: ['搜尋所有分頁', '搜尋所有分頁', '周圍搵', '掘地三尺咁搵', '每個分頁嘅每個角落都搵一次'],
  },
  'tabs.close.matching': {
    en: ['Close tabs containing text', 'Close tabs containing text', 'Close every tab that matches', 'Close every tab that matches', 'Close every tab that dares to match'],
    yue: ['閂含有指定文字嘅分頁', '閂含有指定文字嘅分頁', '啱嘅分頁全部閂', '啱晒條件嗰啲分頁全部閂', '夠膽啱條件嗰啲分頁，一律閂'],
  },
  'tabs.close.notMatching': {
    en: ['Close tabs not containing text', 'Close tabs not containing text', 'Close every tab that does not match', 'Close everything that does not match', 'Spare the matches and close all the rest'],
    yue: ['閂唔含指定文字嘅分頁', '閂唔含指定文字嘅分頁', '唔啱嘅分頁全部閂', '唔啱條件嗰啲全部閂', '啱嘅留返，其餘全部清場'],
  },
  'tabs.close.preview': {
    en: [
      'This will close {count} of {total} tabs.',
      'This will close {count} of {total} tabs.',
      'That would close {count} of your {total} tabs.',
      'Careful — that closes {count} of your {total} tabs.',
      'Brace yourself: {count} of your {total} tabs are for the chop.',
    ],
    yue: [
      '會閂 {total} 個入面嘅 {count} 個分頁。',
      '會閂 {total} 個入面嘅 {count} 個分頁。',
      '咁樣會閂咗你 {total} 個分頁入面嘅 {count} 個。',
      '小心啲，咁樣會閂咗 {total} 個入面 {count} 個分頁。',
      '深呼吸：{total} 個分頁入面，有 {count} 個要人頭落地。',
    ],
  },
  'tabs.close.none': {
    en: ['Nothing matches, so nothing will close.', 'Nothing matches, so nothing will close.', 'Nothing matches — no tabs would close.', 'Nothing matches, so everybody survives.', 'Nothing matches. Every tab lives to see another day.'],
    yue: ['冇嘢啱，所以唔會閂到嘢。', '冇嘢啱，所以唔會閂到嘢。', '冇一個啱，所以冇分頁會閂。', '冇嘢啱，全部生還。', '一個都唔啱，班分頁全部大難不死。'],
  },
  'tabs.close.all': {
    en: [
      'That matches every tab. Refine the query or close them deliberately.',
      'That matches every tab. Refine the query or close them deliberately.',
      'That matches every single tab — narrow it down, or close them on purpose.',
      'That matches everything. Narrow it down unless you truly meant all of them.',
      'That matches every tab you own. Narrow it down, unless total annihilation was the plan.',
    ],
    yue: [
      '咁樣所有分頁都啱。收窄個查詢，或者你自己逐個閂。',
      '咁樣所有分頁都啱。收窄個查詢，或者你自己逐個閂。',
      '咁樣連一個都走唔甩，收窄啲啦，或者你真係想全部閂。',
      '全中喎。收窄啲啦，除非你真係想全部一鑊熟。',
      '全部中晒。收窄啲啦，除非你今日就係想滅門。',
    ],
  },
  'tabs.close.emptyQuery': {
    en: ['Type something first.', 'Type something first.', 'Type something to match on first.', 'Give it something to match on first.', 'Give it something to work with — it cannot read minds.'],
    yue: ['先打啲嘢入去。', '先打啲嘢入去。', '打啲嘢入去先啦。', '畀啲嘢佢對先得㗎嘛。', '打啲嘢入去先啦，佢又唔識讀心。'],
  },
  'tabs.close.invalid': {
    en: ['The query is not valid: {error}', 'The query is not valid: {error}', 'That query does not work: {error}', 'That query is broken: {error}', 'That query is a shambles: {error}'],
    yue: ['查詢唔正確：{error}', '查詢唔正確：{error}', '呢個查詢用唔到：{error}', '呢個查詢壞咗：{error}', '呢個查詢亂到冇朋友：{error}'],
  },
  'tabs.close.pinnedExcluded': {
    en: ['Pinned tabs are left alone.', 'Pinned tabs are left alone.', 'Pinned tabs stay where they are.', 'Pinned tabs are safe from this.', 'Pinned tabs are untouchable. They have earned it.'],
    yue: ['釘住嘅分頁唔會郁。', '釘住嘅分頁唔會郁。', '釘住嗰啲照留低。', '釘住嗰啲安全，唔關佢事。', '釘住嗰啲係免死金牌，郁佢唔到。'],
  },
  'tabs.close.includePinned': {
    en: ['Include pinned tabs', 'Include pinned tabs', 'Include the pinned tabs too', 'Take the pinned ones as well', 'Take the pinned ones too, no mercy'],
    yue: ['包埋釘住嘅分頁', '包埋釘住嘅分頁', '連釘住嗰啲都計埋', '釘住嗰啲都要埋單', '連釘住嗰啲都唔放過，冇得留低'],
  },
  'tabs.close.confirm.title': {
    en: ['Close {count} tabs?', 'Close {count} tabs?', 'Close {count} tabs?', 'Really close {count} tabs?', 'Really send {count} tabs to their doom?'],
    yue: ['閂 {count} 個分頁？', '閂 {count} 個分頁？', '閂 {count} 個分頁呀？', '真係閂 {count} 個分頁？', '真係要送 {count} 個分頁上路？'],
  },
  'tabs.close.confirm.body': {
    en: [
      '{count} tabs will close. {unsaved} of them have unsaved work.',
      '{count} tabs will close. {unsaved} of them have unsaved work.',
      '{count} tabs are about to close, and {unsaved} of them have work you have not saved.',
      '{count} tabs are for the chop, and {unsaved} of them are still holding unsaved work.',
      '{count} tabs go over the edge, and {unsaved} of them are still clutching unsaved work.',
    ],
    yue: [
      '會閂 {count} 個分頁，其中 {unsaved} 個有嘢未儲存。',
      '會閂 {count} 個分頁，其中 {unsaved} 個有嘢未儲存。',
      '就嚟閂 {count} 個分頁，入面有 {unsaved} 個仲有嘢未儲低。',
      '{count} 個分頁就嚟冇命，仲有 {unsaved} 個係抱住啲未儲存嘅嘢。',
      '{count} 個分頁準備跳崖，其中 {unsaved} 個手上仲揸住未儲存嘅心血。',
    ],
  },
  'tabs.close.done': {
    en: ['Closed {count} tabs.', 'Closed {count} tabs.', 'Closed {count} tabs.', '{count} tabs, gone.', '{count} tabs, swept clean away.'],
    yue: ['閂咗 {count} 個分頁。', '閂咗 {count} 個分頁。', '閂咗 {count} 個分頁喇。', '{count} 個分頁，冇晒。', '{count} 個分頁，一鋪清袋，乾淨企理。'],
  },

  // =========================================================================
  // settings — the tab, its sections, and every row
  // =========================================================================

  'settings.title': {
    en: ['Settings', 'Settings', 'Settings', 'Settings', 'Settings, where you bend the app to your will'],
    yue: ['設定', '設定', '設定', '設定', '設定，喺呢度將個 app 調校到聽你話'],
  },
  'settings.desc': {
    en: [
      'Everything here is saved on this computer.',
      'Everything here is saved on this computer.',
      'Everything here stays on this computer.',
      'Everything here stays on this computer — nothing is sent anywhere.',
      'Everything here stays on this computer. Nothing is sent anywhere, to anyone, ever.',
    ],
    yue: [
      '呢度嘅嘢全部存喺呢部電腦。',
      '呢度嘅嘢全部存喺呢部電腦。',
      '呢度啲嘢淨係留喺你部電腦度。',
      '呢度啲嘢淨係留喺你部機，一啲都唔會傳出去。',
      '呢度啲嘢死都唔會離開你部機，一個字都唔會傳畀第二個人。',
    ],
  },
  'search.settings.label': {
    en: ['Search settings', 'Search settings', 'Search every setting', 'Hunt through every setting', 'Interrogate every setting in the place'],
    yue: ['搜尋設定', '搜尋設定', '搵勻所有設定', '喺所有設定度掘下', '成堆設定，逐個查一次'],
  },
  'search.settings.placeholder': {
    en: ['Search settings', 'Search settings', 'What are you looking for?', 'What are you after?', 'Name it and it shall be found'],
    yue: ['搜尋設定', '搜尋設定', '你搵緊咩？', '想搵咩呀？', '講個名出嚟，包搵到'],
  },
  'settings.search.count': {
    en: ['{count} settings match.', '{count} settings match.', '{count} settings match.', '{count} settings turned up.', '{count} settings answered the call.'],
    yue: ['{count} 個設定啱。', '{count} 個設定啱。', '有 {count} 個設定啱。', '搵到 {count} 個設定。', '{count} 個設定應聲而出。'],
  },
  'settings.search.empty': {
    en: ['No setting matches {query}.', 'No setting matches {query}.', 'Nothing matches {query}.', 'Nothing here matches {query}.', 'Not one setting answers to {query}.'],
    yue: ['冇設定啱 {query}。', '冇設定啱 {query}。', '冇嘢啱 {query}。', '呢度冇嘢啱 {query} 喎。', '成堆設定，冇一個應 {query} 呢個名。'],
  },
  'settings.section.language': {
    en: ['Language', 'Language', 'Language', 'Language', 'Language, and how funny it gets'],
    yue: ['語言', '語言', '語言', '語言', '語言，同埋要幾好笑'],
  },
  'settings.section.language.desc': {
    en: [
      'Choose the language and how the app speaks.',
      'Choose the language and how the app speaks to you.',
      'Pick the language, and pick how much personality it has.',
      'Pick the language, then decide how much cheek it is allowed.',
      'Pick the language, then decide how theatrical it is allowed to be.',
    ],
    yue: [
      '揀語言，同埋個 app 點同你講嘢。',
      '揀語言，同埋個 app 點同你講嘢。',
      '揀語言，再揀佢有幾多性格。',
      '揀語言，再決定佢可以幾串。',
      '揀語言，再決定佢可以做戲做到幾大。',
    ],
  },
  'settings.section.appearance': {
    en: ['Appearance', 'Appearance', 'Appearance', 'Appearance', 'Appearance, down to the last pixel'],
    yue: ['外觀', '外觀', '外觀', '外觀', '外觀，執到最後一粒 pixel'],
  },
  'settings.section.appearance.desc': {
    en: [
      'Colours, sizes and spacing for the shell.',
      'Colours, sizes and spacing for the shell around the game.',
      'Colours, sizes and spacing — every part of the shell can be changed.',
      'Colours, sizes and spacing. Every last part of the shell will do as it is told.',
      'Colours, sizes and spacing. Every pixel of the shell is yours to boss about.',
    ],
    yue: [
      '外殼嘅顏色、大細同間距。',
      '遊戲外殼嘅顏色、大細同間距。',
      '顏色、大細、間距——外殼每一部分都改到。',
      '顏色、大細、間距。外殼每一忽都會乖乖聽你話。',
      '顏色、大細、間距。外殼每一粒 pixel 都畀你使喚。',
    ],
  },
  'settings.section.motion': {
    en: ['Motion and accessibility', 'Motion and accessibility', 'Motion and accessibility', 'Motion and accessibility', 'Motion and accessibility, taken seriously'],
    yue: ['動態同無障礙', '動態同無障礙', '動態同無障礙', '動態同無障礙', '動態同無障礙，認真做嗰隻'],
  },
  'settings.section.motion.desc': {
    en: [
      'Animation, focus and screen reader behaviour.',
      'Animation, focus and screen reader behaviour.',
      'How much things move, and how the app talks to a screen reader.',
      'How much things move, and how politely the app talks to a screen reader.',
      'How much things move, and how the app behaves for the people who need it to behave.',
    ],
    yue: [
      '動畫、焦點同讀屏軟件嘅行為。',
      '動畫、焦點同讀屏軟件嘅行為。',
      '啲嘢郁得幾多，同埋個 app 點同讀屏軟件溝通。',
      '啲嘢郁得幾多，同埋個 app 對讀屏軟件有幾有禮貌。',
      '啲嘢郁得幾多，同埋對真係需要佢乖嘅人，佢有幾乖。',
    ],
  },
  'settings.section.scale': {
    en: ['Display scale', 'Display scale', 'Display scale', 'Display scale', 'Display scale, for eyes of every kind'],
    yue: ['顯示比例', '顯示比例', '顯示比例', '顯示比例', '顯示比例，照顧晒各種眼力'],
  },
  'settings.section.scale.desc': {
    en: [
      'How large the shell is drawn.',
      'How large the shell is drawn.',
      'How large everything outside the game is drawn.',
      'How large everything outside the game is drawn. Nothing will clip.',
      'How large everything outside the game is drawn. Nothing clips, nothing overlaps, nothing escapes.',
    ],
    yue: [
      '外殼畫得幾大。',
      '外殼畫得幾大。',
      '遊戲以外嘅嘢畫得幾大。',
      '遊戲以外嘅嘢畫得幾大，保證唔會切親。',
      '遊戲以外嘅嘢畫得幾大。唔會切親、唔會疊埋、唔會走出畫面。',
    ],
  },
  'settings.section.audio': {
    en: ['Audio', 'Audio', 'Audio', 'Audio', 'Audio, synthesised on the spot'],
    yue: ['音效', '音效', '音效', '音效', '音效，即場合成，唔用罐頭'],
  },
  'settings.section.audio.desc': {
    en: [
      'Every sound is generated at runtime. No audio files.',
      'Every sound is generated at runtime. There are no audio files.',
      'Every sound is made up on the spot — there is not one audio file in here.',
      'Every sound is made up on the spot. Not one audio file, not one download.',
      'Every sound is conjured out of arithmetic on the spot. Not one audio file anywhere.',
    ],
    yue: [
      '所有聲都係即時生成，冇音樂檔案。',
      '所有聲都係即時生成，一個音檔都冇。',
      '啲聲全部即場整出嚟，一個音檔都冇。',
      '啲聲全部即場整，一個音檔都冇，一次都唔使載。',
      '啲聲全部係用數學即場變出嚟，成個 app 一個音檔都冇。',
    ],
  },
  'settings.section.game': {
    en: ['Game', 'Game', 'Game', 'Game', 'The farm itself'],
    yue: ['遊戲', '遊戲', '遊戲', '遊戲', '塊田本身'],
  },
  'settings.section.game.desc': {
    en: [
      'The farm, its save and its seed.',
      'The farm, its save and its seed.',
      'The farm itself — the save and the seed it grew from.',
      'The farm itself: the save, and the seed the whole valley grew from.',
      'The farm itself: one save, and the single number the whole valley grew out of.',
    ],
    yue: [
      '塊田、佢個存檔同 seed。',
      '塊田、佢個存檔同 seed。',
      '塊田本身——個存檔，同埋佢生出嚟嗰粒 seed。',
      '塊田本身：個存檔，同埋成個山谷生出嚟嗰粒 seed。',
      '塊田本身：一個存檔，同埋孕育成個山谷嘅嗰一個數字。',
    ],
  },
  'settings.section.data': {
    en: ['Data', 'Data', 'Data', 'Data', 'Data, and how to take it with you'],
    yue: ['資料', '資料', '資料', '資料', '資料，同埋點樣打包帶走'],
  },
  'settings.section.data.desc': {
    en: [
      'Export, import and reset. Everything stays on this computer.',
      'Export, import and reset. Everything stays on this computer.',
      'Export it, import it, or wipe it. It never leaves this computer.',
      'Export it, import it, or wipe the lot. It never leaves this computer.',
      'Export it, import it, or wipe the lot. Not one byte ever leaves this computer.',
    ],
    yue: [
      '匯出、匯入同重設。所有嘢留喺呢部電腦。',
      '匯出、匯入同重設。所有嘢留喺呢部電腦。',
      '匯出、匯入、或者一鋪清晒。啲嘢永遠唔會離開呢部機。',
      '匯出、匯入、或者一次過清光。啲嘢永遠唔會離開呢部機。',
      '匯出、匯入、或者一鋪清袋。一個 byte 都唔會離開呢部機。',
    ],
  },
  'settings.section.about': {
    en: ['About', 'About', 'About', 'About', 'About, credits and confessions'],
    yue: ['關於', '關於', '關於', '關於', '關於、鳴謝，同埋自白'],
  },
  'settings.section.about.desc': {
    en: [
      'Version, licence and credits.',
      'Version, licence and credits.',
      'Version, licence and who to thank.',
      'Version, licence, and who to thank for all this.',
      'Version, licence, and the list of people to thank for the whole valley.',
    ],
    yue: [
      '版本、授權同鳴謝。',
      '版本、授權同鳴謝。',
      '版本、授權，同埋要多謝邊個。',
      '版本、授權，同埋呢一切要多謝邊個。',
      '版本、授權，同埋成個山谷要多謝嘅一班人。',
    ],
  },

  // ---- language rows ------------------------------------------------------

  'settings.lang.mode.label': {
    en: ['Language', 'Language', 'Language', 'Which language?', 'Which tongue shall we speak?'],
    yue: ['語言', '語言', '語言', '要邊種語言？', '我哋今日講邊種話好？'],
  },
  'settings.lang.mode.desc': {
    en: [
      'English, Cantonese, or both at once.',
      'English, Cantonese, or both at once.',
      'English, Cantonese, or both side by side.',
      'English, Cantonese, or both side by side if you cannot choose.',
      'English, Cantonese, or both at once for the greedy and the bilingual.',
    ],
    yue: [
      '英文、廣東話，或者兩樣一齊。',
      '英文、廣東話，或者兩樣一齊。',
      '英文、廣東話，或者兩樣並排一齊出。',
      '英文、廣東話，揀唔到就兩樣一齊出啦。',
      '英文、廣東話，或者兩樣一齊——貪心同雙語人士專用。',
    ],
  },
  'settings.lang.option.en': {
    en: ['English', 'English', 'English', 'English', 'English'],
    yue: ['English 英文', 'English 英文', 'English 英文', 'English 英文', 'English 英文'],
  },
  'settings.lang.option.en.desc': {
    en: ['English only.', 'English only.', 'English only.', 'English, and nothing but.', 'English, and not a character more.'],
    yue: ['淨係英文。', '淨係英文。', '淨係出英文。', '淨係英文，其他免問。', '淨係英文，多一個字都冇。'],
  },
  'settings.lang.option.yue': {
    en: ['Cantonese', 'Cantonese', 'Cantonese', 'Cantonese', 'Cantonese'],
    yue: ['廣東話', '廣東話', '廣東話', '廣東話', '廣東話'],
  },
  'settings.lang.option.yue.desc': {
    en: [
      'Hong Kong Cantonese, in traditional characters.',
      'Hong Kong Cantonese, in traditional characters.',
      'Hong Kong Cantonese, written the way people actually text.',
      'Hong Kong Cantonese, written the way people actually text — not textbook Chinese.',
      'Hong Kong Cantonese, written the way people actually text, particles and all.',
    ],
    yue: [
      '香港廣東話，繁體字。',
      '香港廣東話，繁體字。',
      '香港廣東話，好似平時 send message 咁寫。',
      '香港廣東話，好似平時 send message 咁寫，唔係書面語。',
      '香港廣東話，語氣詞都齊晒，好似平時傾偈咁。',
    ],
  },
  'settings.lang.option.both': {
    en: ['Both', 'Both', 'Both at once', 'Both at once', 'Both at once, shoulder to shoulder'],
    yue: ['兩樣一齊', '兩樣一齊', '兩樣一齊出', '兩樣一齊出', '兩種話孖住上，肩並肩'],
  },
  'settings.lang.option.both.desc': {
    en: [
      'English and Cantonese together, separated by {separator}.',
      'English and Cantonese together, separated by {separator}.',
      'English and Cantonese side by side, with {separator} between them.',
      'English and Cantonese side by side, joined by a tidy {separator}.',
      'English and Cantonese arm in arm, with a dignified {separator} holding them together.',
    ],
    yue: [
      '英文同廣東話一齊出，中間用 {separator} 分開。',
      '英文同廣東話一齊出，中間用 {separator} 分開。',
      '英文廣東話並排出，中間夾住個 {separator}。',
      '英文廣東話孖住上，中間用個靚靚 {separator} 隔開。',
      '英文同廣東話手拖手一齊出場，中間有個好有型嘅 {separator} 撐住。',
    ],
  },
  'settings.lang.funny.en.label': {
    en: ['English funny level', 'English funny level', 'How funny the English is', 'How funny the English is allowed to be', 'How theatrical the English is allowed to get'],
    yue: ['英文搞笑程度', '英文搞笑程度', '英文有幾好笑', '英文可以幾好笑', '英文可以做戲做到幾大'],
  },
  'settings.lang.funny.en.desc': {
    en: [
      'Level {level} of {max}: {name}.',
      'Level {level} of {max}: {name}.',
      'Currently level {level} of {max} — {name}.',
      'Sitting at level {level} of {max}, which is {name}.',
      'Currently level {level} of {max}, otherwise known as {name}.',
    ],
    yue: [
      '第 {level} 級（共 {max} 級）：{name}。',
      '第 {level} 級（共 {max} 級）：{name}。',
      '而家係第 {level} 級（共 {max} 級）——{name}。',
      '而家企喺第 {level} 級（共 {max} 級），即係 {name}。',
      '而家係第 {level} 級（共 {max} 級），江湖人稱 {name}。',
    ],
  },
  'settings.lang.funny.yue.label': {
    en: ['Cantonese funny level', 'Cantonese funny level', 'How funny the Cantonese is', 'How funny the Cantonese is allowed to be', 'How theatrical the Cantonese is allowed to get'],
    yue: ['廣東話搞笑程度', '廣東話搞笑程度', '廣東話有幾好笑', '廣東話可以幾好笑', '廣東話可以玩到幾癲'],
  },
  'settings.lang.funny.yue.desc': {
    en: [
      'Level {level} of {max}: {name}.',
      'Level {level} of {max}: {name}.',
      'Currently level {level} of {max} — {name}.',
      'Sitting at level {level} of {max}, which is {name}.',
      'Currently level {level} of {max}, otherwise known as {name}.',
    ],
    yue: [
      '第 {level} 級（共 {max} 級）：{name}。',
      '第 {level} 級（共 {max} 級）：{name}。',
      '而家係第 {level} 級（共 {max} 級）——{name}。',
      '而家企喺第 {level} 級（共 {max} 級），即係 {name}。',
      '而家係第 {level} 級（共 {max} 級），江湖人稱 {name}。',
    ],
  },
  'settings.lang.funny.level.1': {
    en: ['Plain', 'Plain', 'Plain', 'Plain', 'Plain'],
    yue: ['平實', '平實', '平實', '平實', '平實'],
  },
  'settings.lang.funny.level.1.desc': {
    en: [
      'Facts only. The wording you would put in a manual.',
      'Facts only. The wording you would put in a manual.',
      'Just the facts, the way a manual would put it.',
      'Just the facts. No jokes, no flourishes, no nonsense.',
      'Just the facts. Not one joke shall pass these lips.',
    ],
    yue: [
      '淨係講事實，好似說明書咁。',
      '淨係講事實，好似說明書咁。',
      '淨係講事實，同說明書一模一樣。',
      '淨係講事實，唔講笑，唔花巧，唔多嘢。',
      '淨係講事實。一個笑話都唔會漏出嚟。',
    ],
  },
  'settings.lang.funny.level.2': {
    en: ['Clear', 'Clear', 'Clear', 'Clear', 'Clear'],
    yue: ['清楚', '清楚', '清楚', '清楚', '清楚'],
  },
  'settings.lang.funny.level.2.desc': {
    en: [
      'Plain, but written by a person.',
      'Plain, but written by a person.',
      'Still plain, but it sounds like a person wrote it.',
      'Still plain, but at least a human being wrote it.',
      'Still plain, but a living human being clearly held the pen.',
    ],
    yue: [
      '簡單，但係似人寫。',
      '簡單，但係似人寫。',
      '一樣簡單，不過睇落係人寫嘅。',
      '一樣簡單，起碼似係個活人寫。',
      '一樣簡單，不過明顯係有心跳嗰種人寫嘅。',
    ],
  },
  'settings.lang.funny.level.3': {
    en: ['Warm', 'Warm', 'Warm', 'Warm', 'Warm'],
    yue: ['親切', '親切', '親切', '親切', '親切'],
  },
  'settings.lang.funny.level.3.desc': {
    en: [
      'The house voice. Friendly, not silly.',
      'The house voice. Friendly, not silly.',
      'The house voice — friendly, and never silly.',
      'The house voice: friendly, warm, and never gone daft.',
      'The house voice: warm as a lantern, and never once daft.',
    ],
    yue: [
      '招牌語氣，友善但唔痴線。',
      '招牌語氣，友善但唔痴線。',
      '招牌語氣——友善，但唔會痴痴哋。',
      '招牌語氣：友善、有溫度，但唔會傻更更。',
      '招牌語氣：暖到好似盞燈籠，但一次都冇失儀。',
    ],
  },
  'settings.lang.funny.level.4': {
    en: ['Cheeky', 'Cheeky', 'Cheeky', 'Cheeky', 'Cheeky'],
    yue: ['串串貢', '串串貢', '串串貢', '串串貢', '串串貢'],
  },
  'settings.lang.funny.level.4.desc': {
    en: [
      'Jokes allowed. Facts still untouched.',
      'Jokes allowed. The facts stay untouched.',
      'Jokes allowed, and the facts stay exactly where they were.',
      'Jokes allowed, teasing allowed, and the facts stay exactly where they were.',
      'Jokes, teasing and mild insolence allowed. The facts remain untouched throughout.',
    ],
    yue: [
      '可以講笑，事實照舊。',
      '可以講笑，事實一個字都唔改。',
      '可以講笑，事實照舊擺喺原位。',
      '可以講笑、可以窒你，但事實照舊擺喺原位。',
      '可以講笑、可以窒你、可以串下你，但啲事實一粒都唔郁。',
    ],
  },
  'settings.lang.funny.level.5': {
    en: ['Theatrical', 'Theatrical', 'Theatrical', 'Theatrical', 'Theatrical'],
    yue: ['大戲級', '大戲級', '大戲級', '大戲級', '大戲級'],
  },
  'settings.lang.funny.level.5.desc': {
    en: [
      'Full performance. Facts still untouched.',
      'Full performance. The facts stay untouched.',
      'A full performance every time, with the facts still perfectly intact.',
      'Curtains up, orchestra in, and the facts still perfectly intact.',
      'Curtains up, orchestra in, the farmer weeping in the wings — and every fact still perfectly intact.',
    ],
    yue: [
      '做晒成場大戲，事實照舊。',
      '做晒成場大戲，事實一個字都唔改。',
      '次次都做足全場，但啲事實一粒都冇郁過。',
      '拉開幕布、鑼鼓齊鳴，啲事實一粒都冇郁過。',
      '拉開幕布、鑼鼓齊鳴、農夫喺台側喊到收唔到聲——但每一個事實都完好無缺。',
    ],
  },
  'settings.lang.disclosure': {
    en: [
      'The funny level changes the wording of every message, including warnings and failures. It never changes a fact: a number, a name, a file path, a key binding, an error code and a crop price read the same at level {min} and at level {max}.',
      'The funny level changes the wording of every message, including warnings and failures. It never changes a fact: a number, a name, a file path, a key binding, an error code and a crop price read the same at level {min} and at level {max}.',
      'The funny level restyles every message you will ever see, warnings and failures included. What it will never do is touch a fact — a number, a name, a file path, a key binding, an error code and a crop price read exactly the same at level {min} and at level {max}.',
      'The funny level restyles every message in the app, warnings and failures included, so do not expect a quiet life at the top. What it will never do is touch a fact: a number, a name, a file path, a key binding, an error code and a crop price read exactly the same at level {min} and at level {max}.',
      'The funny level restyles every message this app will ever say to you — warnings, failures, disasters and all. But it is under strict orders and it never touches a fact: a number, a name, a file path, a key binding, an error code and a crop price read exactly, identically, immovably the same at level {min} and at level {max}.',
    ],
    yue: [
      '搞笑程度會改變每一句訊息嘅寫法，包括警告同失敗。但佢唔會改事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，喺第 {min} 級同第 {max} 級都係一模一樣。',
      '搞笑程度會改變每一句訊息嘅寫法，包括警告同失敗。但佢唔會改事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，喺第 {min} 級同第 {max} 級都係一模一樣。',
      '搞笑程度會將你見到嘅每一句嘢重新包裝，連警告同失敗都唔例外。但佢死都唔會郁事實——數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，第 {min} 級同第 {max} 級一模一樣。',
      '搞笑程度會將成個 app 每一句嘢重新包裝，連警告同失敗都照玩，所以調到最盡就唔好指望有安樂茶飯。但佢死都唔會郁事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，第 {min} 級同第 {max} 級一模一樣。',
      '搞笑程度會將呢個 app 講過嘅每一句嘢重新包裝——警告、失敗、大鑊嘢，一律照玩。但佢係受過嚴令嘅：事實一粒都唔准郁。數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，喺第 {min} 級同第 {max} 級都係一模一樣，分毫不差。',
    ],
  },
  'settings.lang.disclosure.example': {
    en: [
      'For example, {crop} sells for {price}g at every level.',
      'For example, {crop} sells for {price}g at every level.',
      'For example: {crop} sells for {price}g, at every single level.',
      'For example: {crop} sells for {price}g at level one and {price}g at level five. Funny that.',
      'For example: {crop} sells for {price}g at level one and — hold your breath — {price}g at level five.',
    ],
    yue: [
      '例如 {crop} 每一級都係賣 {price}g。',
      '例如 {crop} 每一級都係賣 {price}g。',
      '舉個例：{crop} 無論邊一級，都係賣 {price}g。',
      '舉個例：{crop} 第一級賣 {price}g，第五級都係賣 {price}g。咁啱得咁蹺。',
      '舉個例：{crop} 第一級賣 {price}g，然後——屏住呼吸——第五級都係賣 {price}g。',
    ],
  },
  'settings.lang.preview.label': {
    en: ['Preview', 'Preview', 'Have a listen', 'Have a listen to it', 'A small sample, for your consideration'],
    yue: ['預覽', '預覽', '聽下先', '聽下佢點講', '畀個 sample 你，慢慢品嚐'],
  },
  'settings.lang.changed': {
    en: ['Language set to {lang}.', 'Language set to {lang}.', 'Now speaking {lang}.', 'Right then — {lang} it is.', 'From this moment on, we speak {lang}.'],
    yue: ['語言已設為 {lang}。', '語言已設為 {lang}。', '而家講緊 {lang}。', '好啦，就 {lang} 啦。', '由呢一刻起，我哋講 {lang}。'],
  },
  'settings.lang.funny.changed': {
    en: ['Funny level set to {level}, {name}.', 'Funny level set to {level}, {name}.', 'Funny level is now {level} — {name}.', 'Funny level cranked to {level}, otherwise known as {name}.', 'Funny level hauled up to {level}, otherwise known as {name}. Consequences follow.'],
    yue: ['搞笑程度設為第 {level} 級，{name}。', '搞笑程度設為第 {level} 級，{name}。', '搞笑程度而家係第 {level} 級——{name}。', '搞笑程度扭上第 {level} 級，江湖人稱 {name}。', '搞笑程度扭到第 {level} 級，江湖人稱 {name}。後果自負。'],
  },

  // ---- motion, scale, audio, game, data, about ----------------------------

  'settings.motion.label': {
    en: ['Motion', 'Motion', 'How much things move', 'How much things move', 'How much this place is allowed to move'],
    yue: ['動態效果', '動態效果', '啲嘢郁得幾多', '啲嘢郁得幾多', '呢度可以郁得幾勁'],
  },
  'settings.motion.desc': {
    en: [
      'This setting overrides the system preference in either direction.',
      'This setting overrides the system preference in either direction.',
      'This overrides what your system asks for, in either direction.',
      'This overrules your system preference, in either direction — you have the final say.',
      'This overrules your system preference in either direction. You are the final authority here.',
    ],
    yue: [
      '呢個設定會覆蓋系統偏好，兩邊都得。',
      '呢個設定會覆蓋系統偏好，兩邊都得。',
      '呢個會蓋過你系統嘅設定，兩邊都得。',
      '呢個會蓋過你系統嘅設定，兩邊都得——你話事。',
      '呢個會蓋過你系統嘅設定，兩邊都得。喺呢度你最大。',
    ],
  },
  'settings.motion.option.system': {
    en: ['Follow the system', 'Follow the system', 'Follow the system', 'Do whatever the system says', 'Obey the system, quietly'],
    yue: ['跟系統', '跟系統', '跟返系統', '系統話點就點', '乖乖聽系統話'],
  },
  'settings.motion.option.full': {
    en: ['Full motion', 'Full motion', 'Full motion', 'Everything moves', 'Everything sways, drifts and sparkles'],
    yue: ['全部動態', '全部動態', '全部動態', '乜都會郁', '搖曳、飄雪、閃閃令，樣樣齊'],
  },
  'settings.motion.option.reduced': {
    en: ['Reduced motion', 'Reduced motion', 'Calm it down', 'Calm the whole thing down', 'Still the valley — tweens stay, sparkle goes'],
    yue: ['減少動態', '減少動態', '靜啲', '成個靜落嚟', '成個山谷靜落嚟——過渡照留，閃粉冇晒'],
  },
  'settings.motion.reduced.note': {
    en: [
      'Particles, shake and sway stop. Movement between tiles stays.',
      'Particles, shake and sway stop. Movement between tiles stays.',
      'Particles, shake and sway all stop; the farmer still walks between tiles properly.',
      'Particles, shake and sway are shown the door; the farmer still walks like a person.',
      'Particles, shake and sway are shown the door. The farmer still walks like a person, thank goodness.',
    ],
    yue: [
      '粒子、震動同搖擺會停，格與格之間嘅移動保留。',
      '粒子、震動同搖擺會停，格與格之間嘅移動保留。',
      '粒子、震動、搖擺全部停晒；農夫行格仔照舊行得好地地。',
      '粒子、震動、搖擺一律請走；農夫照舊好似個人咁行路。',
      '粒子、震動、搖擺一律請走。農夫照舊好似個人咁行路，好彩。',
    ],
  },
  'settings.motion.announce.label': {
    en: ['Announce changes to screen readers', 'Announce changes to screen readers', 'Announce what changes to a screen reader', 'Tell a screen reader what just happened', 'Narrate every change aloud for a screen reader'],
    yue: ['向讀屏軟件播報變化', '向讀屏軟件播報變化', '將啲變化講畀讀屏軟件聽', '啱啱發生咩事，話埋畀讀屏軟件知', '每一個變化都親自講畀讀屏軟件聽'],
  },
  'settings.motion.announce.desc': {
    en: [
      'State changes are mirrored into a live region.',
      'State changes are mirrored into a live region.',
      'Anything that changes is mirrored into a live region for a screen reader.',
      'Anything that changes gets mirrored into a live region, so nothing happens in silence.',
      'Every change is mirrored into a live region, so nothing whatsoever happens in silence.',
    ],
    yue: [
      '狀態變化會鏡射到 live region。',
      '狀態變化會鏡射到 live region。',
      '任何變化都會鏡射入 live region 畀讀屏軟件讀。',
      '任何變化都會入 live region，冇嘢會靜靜雞發生。',
      '每一個變化都會入 live region，一件事都唔准靜靜雞發生。',
    ],
  },
  'settings.scale.label': {
    en: ['Scale', 'Scale', 'Scale', 'How big?', 'How big shall we make it all?'],
    yue: ['比例', '比例', '比例', '要幾大？', '成個 app 要放到幾大先夠？'],
  },
  'settings.scale.option': {
    en: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
    yue: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
  },
  'settings.scale.desc': {
    en: [
      'Tested at {min}% to {max}%, and down to a {width}px window.',
      'Tested at {min}% to {max}%, and down to a {width}px window.',
      'It behaves from {min}% all the way to {max}%, and down to a {width}px window.',
      'It behaves from {min}% to {max}%, and squeezes down to a {width}px window without complaint.',
      'It holds its nerve from {min}% to {max}%, and squeezes down to a {width}px window without dropping a single pixel.',
    ],
    yue: [
      '由 {min}% 到 {max}% 都試過，最窄到 {width}px 個窗。',
      '由 {min}% 到 {max}% 都試過，最窄到 {width}px 個窗。',
      '由 {min}% 去到 {max}% 都乖乖哋，窄到 {width}px 都頂得順。',
      '由 {min}% 去到 {max}% 都乖，迫到 {width}px 都唔會嘈。',
      '由 {min}% 撐到 {max}%，迫到 {width}px 都一粒 pixel 都唔會甩。',
    ],
  },
  'settings.audio.mute.label': {
    en: ['Mute', 'Mute', 'Mute everything', 'Silence the lot', 'Silence the entire valley'],
    yue: ['靜音', '靜音', '全部靜音', '全部收聲', '成個山谷即刻收聲'],
  },
  'settings.audio.mute.desc': {
    en: [
      'Audio never starts before your first input.',
      'Audio never starts before your first input.',
      'Sound never starts until you press something first.',
      'Sound will not make a peep until you press something first.',
      'Sound will not make a single peep until you press something. It has manners.',
    ],
    yue: [
      '你未撳嘢之前，音效唔會播。',
      '你未撳嘢之前，音效唔會播。',
      '你未撳過嘢之前，聲都唔會出。',
      '你未撳過嘢，佢連一聲都唔敢出。',
      '你未撳過嘢，佢連一聲都唔敢出。好有家教。',
    ],
  },
  'settings.audio.test': {
    en: ['Play a test sound', 'Play a test sound', 'Play a test sound', 'Give me a sound', 'Let us hear a sound, then'],
    yue: ['播個測試聲', '播個測試聲', '播個聲聽下', '出個聲嚟聽下', '嚟啦，出個聲嚟聽下'],
  },
  'settings.game.seed.label': {
    en: ['Farm seed', 'Farm seed', 'The seed this farm grew from', 'The seed this whole farm grew from', 'The single number this entire valley grew out of'],
    yue: ['農場 seed', '農場 seed', '呢塊田由邊粒 seed 生出嚟', '成塊田由邊粒 seed 生出嚟', '孕育成個山谷嘅嗰一個數字'],
  },
  'settings.game.seed.desc': {
    en: [
      'Seed {seed}. The same seed always lays out the same farm.',
      'Seed {seed}. The same seed always lays out the same farm.',
      'Seed {seed}. The same seed always grows the same farm, rock for rock.',
      'Seed {seed}. The same seed grows the same farm every time, rock for rock, weed for weed.',
      'Seed {seed}. Feed it the same number and it lays down the same valley, rock for rock, weed for weed, forever.',
    ],
    yue: [
      'Seed {seed}。同一粒 seed 永遠出同一塊田。',
      'Seed {seed}。同一粒 seed 永遠出同一塊田。',
      'Seed {seed}。同一粒 seed 永遠生出同一塊田，連粒石都一樣。',
      'Seed {seed}。同一粒 seed 次次生出同一塊田，連粒石、棵草都一模一樣。',
      'Seed {seed}。餵同一個數字畀佢，佢就鋪返同一個山谷出嚟，連粒石、棵草都分毫不差，永世如是。',
    ],
  },
  'settings.game.newFarm': {
    en: ['Start a new farm', 'Start a new farm', 'Start a new farm', 'Start again on fresh soil', 'Abandon this valley and begin again on fresh soil'],
    yue: ['開新農場', '開新農場', '開過塊新田', '搵塊新地由頭嚟過', '離棄呢個山谷，搵塊新地由頭嚟過'],
  },
  'settings.game.newFarm.confirm.title': {
    en: ['Start a new farm?', 'Start a new farm?', 'Start a new farm?', 'Really start over?', 'Truly abandon this valley?'],
    yue: ['開新農場？', '開新農場？', '開過塊新田？', '真係由頭嚟過？', '真係要離棄呢個山谷？'],
  },
  'settings.game.newFarm.confirm.body': {
    en: [
      'The current save is deleted. {days} days of work go with it.',
      'The current save is deleted. {days} days of work go with it.',
      'The current save is deleted, and {days} days of work go with it.',
      'The current save goes in the bin, and {days} days of work go with it.',
      'The current save goes in the bin, and {days} days of honest labour go with it, unmourned.',
    ],
    yue: [
      '會刪咗而家個存檔，連 {days} 日嘅心血都會冇埋。',
      '會刪咗而家個存檔，連 {days} 日嘅心血都會冇埋。',
      '而家個存檔會刪咗，{days} 日嘅心血一齊冇。',
      '而家個存檔掉落垃圾桶，{days} 日心血一齊陪葬。',
      '而家個存檔掉落垃圾桶，{days} 日血汗一齊陪葬，仲要冇人拜山。',
    ],
  },
  'settings.data.export.label': {
    en: ['Export', 'Export', 'Export your data', 'Take a copy of everything', 'Pack the whole valley into a file and take it with you'],
    yue: ['匯出', '匯出', '匯出你啲資料', 'Copy 晒所有嘢走', '將成個山谷打包落一個檔案帶走'],
  },
  'settings.data.import.label': {
    en: ['Import', 'Import', 'Import data', 'Bring data back in', 'Bring a whole valley back in from a file'],
    yue: ['匯入', '匯入', '匯入資料', '將資料搬返入嚟', '由個檔案度搬返成個山谷入嚟'],
  },
  'settings.data.reset.label': {
    en: ['Reset everything', 'Reset everything', 'Reset everything', 'Wipe the lot', 'Wipe the lot and start from nothing'],
    yue: ['重設所有嘢', '重設所有嘢', '所有嘢重設', '一鋪清晒', '一鋪清袋，由零開始'],
  },
  'settings.data.reset.desc': {
    en: [
      'Deletes settings, appearance, tabs and history on this computer.',
      'Deletes settings, appearance, tabs and history on this computer.',
      'Deletes your settings, appearance, tabs and history from this computer.',
      'Deletes your settings, appearance, tabs and history. There is no undo.',
      'Deletes settings, appearance, tabs and history. There is no undo, no backup and no mercy.',
    ],
    yue: [
      '會刪除呢部電腦上嘅設定、外觀、分頁同歷史。',
      '會刪除呢部電腦上嘅設定、外觀、分頁同歷史。',
      '會刪除你喺呢部機嘅設定、外觀、分頁同歷史。',
      '會刪除你嘅設定、外觀、分頁同歷史，冇得 undo。',
      '會刪除設定、外觀、分頁同歷史。冇得 undo、冇備份、冇同情。',
    ],
  },
  'settings.data.reset.confirm.title': {
    en: ['Reset everything?', 'Reset everything?', 'Reset everything?', 'Really wipe the lot?', 'Truly wipe every last trace?'],
    yue: ['重設所有嘢？', '重設所有嘢？', '真係全部重設？', '真係一鋪清晒？', '真係連一絲痕跡都唔留？'],
  },
  'settings.data.reset.confirm.body': {
    en: [
      'This cannot be undone.',
      'This cannot be undone.',
      'There is no undo for this one.',
      'There is no undo, no backup and no second chance.',
      'There is no undo, no backup, no second chance and no kindly stranger to restore it.',
    ],
    yue: [
      '呢個冇得 undo。',
      '呢個冇得 undo。',
      '呢個真係冇得 undo。',
      '冇得 undo、冇備份、冇下次。',
      '冇得 undo、冇備份、冇下次，亦都唔會有好心人幫你救返。',
    ],
  },
  'settings.data.reset.done': {
    en: ['Everything is reset.', 'Everything is reset.', 'Everything is back to how it started.', 'Done — everything is back to how it started.', 'Done. Everything is exactly as it was on the first morning.'],
    yue: ['全部重設咗喇。', '全部重設咗喇。', '所有嘢返晒最初嘅樣。', '搞掂，所有嘢返晒最初嘅樣。', '搞掂。所有嘢返到第一朝嗰個樣，一模一樣。'],
  },
  'settings.about.version': {
    en: ['Version {version}', 'Version {version}', 'Version {version}', 'Version {version}', 'Version {version}, freshly minted'],
    yue: ['版本 {version}', '版本 {version}', '版本 {version}', '版本 {version}', '版本 {version}，新鮮出爐'],
  },
  'settings.about.licence': {
    en: ['Licence: {licence}', 'Licence: {licence}', 'Licensed under {licence}', 'Licensed under {licence}', 'Licensed under {licence}, generously'],
    yue: ['授權：{licence}', '授權：{licence}', '用 {licence} 授權', '用 {licence} 授權', '用 {licence} 授權，好大方'],
  },
  'settings.about.author': {
    en: ['Made by {author}', 'Made by {author}', 'Made by {author}', 'Made by {author}', 'Made, pixel by pixel, by {author}'],
    yue: ['由 {author} 製作', '由 {author} 製作', '由 {author} 整', '由 {author} 一手包辦', '由 {author} 一粒一粒 pixel 砌出嚟'],
  },
  'settings.about.offline': {
    en: [
      'This app makes no network requests.',
      'This app makes no network requests.',
      'This app never talks to the network. Not once.',
      'This app never talks to the network. Not once, not ever.',
      'This app never talks to the network. Not once, not ever, not even to say hello.',
    ],
    yue: [
      '呢個 app 唔會發任何網絡請求。',
      '呢個 app 唔會發任何網絡請求。',
      '呢個 app 完全唔上網，一次都冇。',
      '呢個 app 完全唔上網，一次都冇，永遠都唔會。',
      '呢個 app 完全唔上網，一次都冇，連打聲招呼都唔會。',
    ],
  },

  // =========================================================================
  // appearance editor
  // =========================================================================

  'appearance.open': {
    en: ['Edit appearance…', 'Edit appearance…', 'Edit how this looks…', 'Change how this looks…', 'Take this element aside and redress it…'],
    yue: ['編輯外觀…', '編輯外觀…', '改下佢個樣…', '改下佢個樣先…', '拉呢件嘢出嚟，幫佢換過套衫…'],
  },
  'appearance.editor.title': {
    en: ['Appearance of {element}', 'Appearance of {element}', 'How {element} looks', 'Dressing up {element}', 'The complete wardrobe of {element}'],
    yue: ['{element} 嘅外觀', '{element} 嘅外觀', '{element} 個樣', '幫 {element} 執下個型', '{element} 嘅全套行頭'],
  },
  'appearance.editor.hint': {
    en: [
      'Right-click any element, or press {keys} while it has focus.',
      'Right-click any element, or press {keys} while it has focus.',
      'Right-click anything here, or press {keys} while it has focus.',
      'Right-click anything at all, or press {keys} while it has focus.',
      'Right-click anything at all, or press {keys} while it has focus. Nothing is safe from you.',
    ],
    yue: [
      '喺任何元素上面右 click，或者當佢有焦點時撳 {keys}。',
      '喺任何元素上面右 click，或者當佢有焦點時撳 {keys}。',
      '喺呢度任何嘢上面右 click，或者佢有焦點時撳 {keys}。',
      '想改邊樣就右 click 邊樣，或者佢有焦點時撳 {keys}。',
      '想改邊樣就右 click 邊樣，或者佢有焦點時撳 {keys}。呢度冇嘢逃得出你手。',
    ],
  },
  'appearance.field.color': {
    en: ['Text colour', 'Text colour', 'Text colour', 'Colour of the text', 'The colour the words are wearing'],
    yue: ['文字顏色', '文字顏色', '字嘅顏色', '啲字咩色', '啲字着緊咩色'],
  },
  'appearance.field.background': {
    en: ['Background', 'Background', 'Background colour', 'Colour behind it', 'The colour standing behind it'],
    yue: ['背景', '背景色', '背景顏色', '背後嗰隻色', '企喺後面嗰隻色'],
  },
  'appearance.field.border': {
    en: ['Border colour', 'Border colour', 'Border colour', 'Colour of the frame', 'The colour of the carved wooden frame'],
    yue: ['邊框顏色', '邊框顏色', '框嘅顏色', '個框咩色', '嗰個雕花木框咩色'],
  },
  'appearance.field.size': {
    en: ['Text size', 'Text size', 'Text size', 'How big the text is', 'How big the words are allowed to be'],
    yue: ['文字大細', '文字大細', '字嘅大細', '啲字有幾大', '啲字最大可以大到幾多'],
  },
  'appearance.field.spacing': {
    en: ['Spacing', 'Spacing', 'Spacing', 'Room around it', 'How much room it gets to breathe'],
    yue: ['間距', '間距', '空隙', '周圍嘅位', '畀佢幾多位唞氣'],
  },
  'appearance.field.weight': {
    en: ['Weight', 'Weight', 'Weight', 'How bold it is', 'How bold it dares to be'],
    yue: ['粗幼', '粗幼', '幾粗', '有幾粗', '夠唔夠膽粗'],
  },
  'appearance.field.align': {
    en: ['Alignment', 'Alignment', 'Alignment', 'Which way it lines up', 'Which way it chooses to line up'],
    yue: ['對齊', '對齊', '點對齊', '向邊邊對齊', '佢想向邊邊對齊'],
  },
  'appearance.field.visible': {
    en: ['Visible', 'Visible', 'Shown or hidden', 'Shown, or hidden away', 'Present, or spirited away entirely'],
    yue: ['顯示', '顯示', '出定唔出', '出嚟定收埋', '現身，定係徹底消失'],
  },
  'appearance.value.inherited': {
    en: ['Inherited', 'Inherited', 'Inherited from the theme', 'Whatever the theme says', 'Whatever the theme decrees'],
    yue: ['繼承', '繼承', '跟主題', '主題話點就點', '主題聖旨話點就點'],
  },
  'appearance.changed': {
    en: ['{element} updated.', '{element} updated.', '{element} has a new look.', '{element} has had a makeover.', '{element} has been utterly transformed.'],
    yue: ['{element} 更新咗。', '{element} 更新咗。', '{element} 換咗個新樣。', '{element} 大變身完成。', '{element} 脫胎換骨，判若兩人。'],
  },
  'appearance.reset': {
    en: ['Reset {element}', 'Reset {element}', 'Put {element} back', 'Put {element} back how it was', 'Return {element} to its original state'],
    yue: ['重設 {element}', '重設 {element}', '{element} 還原', '{element} 打返原形', '{element} 打回原形，做返自己'],
  },
  'appearance.reset.done': {
    en: ['{element} is back to the default.', '{element} is back to the default.', '{element} is back to how it started.', '{element} is back to how it started, no harm done.', '{element} has returned to the default, older and wiser.'],
    yue: ['{element} 還原咗預設。', '{element} 還原咗預設。', '{element} 返咗最初嘅樣。', '{element} 返咗最初嘅樣，冇損失。', '{element} 返咗預設，經一事長一智。'],
  },
  'appearance.resetAll': {
    en: ['Reset all appearance', 'Reset all appearance', 'Reset every appearance change', 'Undo every appearance change', 'Undo every last appearance change in one sweep'],
    yue: ['重設所有外觀', '重設所有外觀', '所有外觀改動重設', '所有外觀改動一次過還原', '所有外觀改動，一鋪過打回原形'],
  },
  'appearance.resetAll.confirm.body': {
    en: ['{count} elements go back to their defaults.', '{count} elements go back to their defaults.', '{count} elements go back to how they started.', '{count} elements go back to how they started. No undo.', '{count} elements march back to their defaults. There is no undo.'],
    yue: ['{count} 個元素會還原做預設。', '{count} 個元素會還原做預設。', '{count} 個元素會返最初嘅樣。', '{count} 個元素會返最初嘅樣，冇得 undo。', '{count} 個元素齊步走返預設。冇得 undo。'],
  },
  'search.appearance.label': {
    en: ['Search appearance settings', 'Search appearance settings', 'Search the appearance settings', 'Hunt through the appearance settings', 'Interrogate every appearance setting there is'],
    yue: ['搜尋外觀設定', '搜尋外觀設定', '搵下外觀設定', '喺外觀設定度掘下', '所有外觀設定，逐個查一次'],
  },
  'search.appearance.placeholder': {
    en: ['Search appearance', 'Search appearance', 'Search appearance', 'What do you want to change?', 'Name what you want changed'],
    yue: ['搜尋外觀', '搜尋外觀', '搵外觀設定', '你想改咩？', '講你想改咩出嚟'],
  },

  // =========================================================================
  // colour picker
  // =========================================================================

  'color.picker.title': {
    en: ['Colour', 'Colour', 'Pick a colour', 'Pick a colour', 'Choose a colour, any colour'],
    yue: ['顏色', '顏色', '揀隻色', '揀隻色啦', '揀隻色，邊隻都得'],
  },
  'color.area.label': {
    en: ['Saturation and brightness', 'Saturation and brightness', 'Saturation and brightness', 'Drag for saturation and brightness', 'Drag about for saturation and brightness'],
    yue: ['飽和度同光暗', '飽和度同光暗', '飽和度同光暗', '拖住揀飽和度同光暗', '周圍拖，揀飽和度同光暗'],
  },
  'color.hue.label': {
    en: ['Hue', 'Hue', 'Hue', 'Hue', 'Hue, the whole rainbow of it'],
    yue: ['色相', '色相', '色相', '色相', '色相，成條彩虹畀你揀'],
  },
  'color.alpha.label': {
    en: ['Opacity', 'Opacity', 'Opacity', 'How solid it is', 'How solid, or how ghostly'],
    yue: ['透明度', '透明度', '透明度', '有幾實淨', '幾實淨，定係幾似鬼影'],
  },
  'color.field.hex': {
    en: ['Hex', 'Hex', 'Hex', 'Hex', 'Hex, for the purists'],
    yue: ['Hex', 'Hex', 'Hex', 'Hex', 'Hex，畀原教旨主義者用'],
  },
  'color.field.rgb': {
    en: ['RGB', 'RGB', 'RGB', 'RGB', 'RGB, red green blue, the old way'],
    yue: ['RGB', 'RGB', 'RGB', 'RGB', 'RGB，紅綠藍，老派做法'],
  },
  'color.field.hsl': {
    en: ['HSL', 'HSL', 'HSL', 'HSL', 'HSL, for people who think in hues'],
    yue: ['HSL', 'HSL', 'HSL', 'HSL', 'HSL，畀慣用色相諗嘢嗰啲人'],
  },
  'color.field.palette': {
    en: ['Palette colour', 'Palette colour', 'From the palette', 'From the valley palette', 'Straight from the valley palette itself'],
    yue: ['調色板顏色', '調色板顏色', '揀調色板嗰啲', '揀山谷調色板嗰啲', '直接由山谷調色板度攞'],
  },
  'color.sync.note': {
    en: [
      'Editing one representation updates the others.',
      'Editing one representation updates the others.',
      'Change any one of these and the rest follow along.',
      'Change any one of these and the rest follow, instantly.',
      'Change any one of these and the rest fall into line at once, obediently.',
    ],
    yue: [
      '改其中一個寫法，其他會跟住變。',
      '改其中一個寫法，其他會跟住變。',
      '改邊個都得，其他自動跟住變。',
      '改邊個都得，其他即刻跟住變。',
      '改邊個都得，其餘即刻乖乖歸位，一個都唔敢慢。',
    ],
  },
  'color.invalid': {
    en: ['{value} is not a colour.', '{value} is not a colour.', '{value} is not a colour this understands.', '{value} is not a colour, sorry.', '{value} is not a colour, and no amount of squinting will make it one.'],
    yue: ['{value} 唔係顏色。', '{value} 唔係顏色。', '{value} 呢個佢睇唔明。', '{value} 唔係顏色喎，唔好意思。', '{value} 唔係顏色，點眯埋眼睇都唔會變成顏色。'],
  },
  'color.current': {
    en: ['Current colour {value}', 'Current colour {value}', 'Currently {value}', 'Currently wearing {value}', 'Currently wearing {value}, and wearing it well'],
    yue: ['而家係 {value}', '而家係 {value}', '而家係 {value}', '而家着緊 {value}', '而家着緊 {value}，仲要幾襯'],
  },
  'color.contrast': {
    en: ['Contrast {ratio} to 1', 'Contrast {ratio} to 1', 'Contrast is {ratio} to 1', 'Contrast sits at {ratio} to 1', 'Contrast stands proudly at {ratio} to 1'],
    yue: ['對比度 {ratio} 比 1', '對比度 {ratio} 比 1', '對比度係 {ratio} 比 1', '對比度企喺 {ratio} 比 1', '對比度威威咁企喺 {ratio} 比 1'],
  },
  'color.contrast.warn': {
    en: [
      'Contrast {ratio} to 1 is below the required {required} to 1.',
      'Contrast {ratio} to 1 is below the required {required} to 1.',
      'Contrast is only {ratio} to 1, under the {required} to 1 this needs.',
      'Contrast is a feeble {ratio} to 1, under the {required} to 1 this needs.',
      'Contrast limps in at {ratio} to 1, well under the {required} to 1 it is meant to clear.',
    ],
    yue: [
      '對比度 {ratio} 比 1，低過要求嘅 {required} 比 1。',
      '對比度 {ratio} 比 1，低過要求嘅 {required} 比 1。',
      '對比度得 {ratio} 比 1，未夠要求嘅 {required} 比 1。',
      '對比度得可憐嘅 {ratio} 比 1，未夠要求嘅 {required} 比 1。',
      '對比度拖住條腳行到 {ratio} 比 1，離要求嘅 {required} 比 1 仲差好遠。',
    ],
  },
  'search.color.label': {
    en: ['Search palette colours', 'Search palette colours', 'Search the palette', 'Hunt through the palette', 'Interrogate all fourteen palette colours'],
    yue: ['搜尋調色板顏色', '搜尋調色板顏色', '搵調色板啲色', '喺調色板度掘下', '十四隻色，逐隻查一次'],
  },
  'search.color.placeholder': {
    en: ['Search colours', 'Search colours', 'Search colours', 'Which colour?', 'Name the colour you want'],
    yue: ['搜尋顏色', '搜尋顏色', '搵色', '要邊隻色？', '講你想要邊隻色'],
  },
  'color.name.ink': {
    en: ['Ink', 'Ink', 'Ink', 'Ink', 'Ink'],
    yue: ['墨黑 Ink', '墨黑 Ink', '墨黑 Ink', '墨黑 Ink', '墨黑 Ink'],
  },
  'color.name.shadow': {
    en: ['Shadow', 'Shadow', 'Shadow', 'Shadow', 'Shadow'],
    yue: ['影 Shadow', '影 Shadow', '影 Shadow', '影 Shadow', '影 Shadow'],
  },
  'color.name.bark': {
    en: ['Bark', 'Bark', 'Bark', 'Bark', 'Bark'],
    yue: ['樹皮 Bark', '樹皮 Bark', '樹皮 Bark', '樹皮 Bark', '樹皮 Bark'],
  },
  'color.name.soil': {
    en: ['Soil', 'Soil', 'Soil', 'Soil', 'Soil'],
    yue: ['泥土 Soil', '泥土 Soil', '泥土 Soil', '泥土 Soil', '泥土 Soil'],
  },
  'color.name.soilWet': {
    en: ['Wet soil', 'Wet soil', 'Wet soil', 'Wet soil', 'Wet soil'],
    yue: ['濕泥 Wet soil', '濕泥 Wet soil', '濕泥 Wet soil', '濕泥 Wet soil', '濕泥 Wet soil'],
  },
  'color.name.grass': {
    en: ['Grass', 'Grass', 'Grass', 'Grass', 'Grass'],
    yue: ['草 Grass', '草 Grass', '草 Grass', '草 Grass', '草 Grass'],
  },
  'color.name.grassLit': {
    en: ['Lit grass', 'Lit grass', 'Lit grass', 'Lit grass', 'Lit grass'],
    yue: ['陽光草 Lit grass', '陽光草 Lit grass', '陽光草 Lit grass', '陽光草 Lit grass', '陽光草 Lit grass'],
  },
  'color.name.leaf': {
    en: ['Leaf', 'Leaf', 'Leaf', 'Leaf', 'Leaf'],
    yue: ['葉 Leaf', '葉 Leaf', '葉 Leaf', '葉 Leaf', '葉 Leaf'],
  },
  'color.name.parchment': {
    en: ['Parchment', 'Parchment', 'Parchment', 'Parchment', 'Parchment'],
    yue: ['羊皮紙 Parchment', '羊皮紙 Parchment', '羊皮紙 Parchment', '羊皮紙 Parchment', '羊皮紙 Parchment'],
  },
  'color.name.cream': {
    en: ['Cream', 'Cream', 'Cream', 'Cream', 'Cream'],
    yue: ['奶白 Cream', '奶白 Cream', '奶白 Cream', '奶白 Cream', '奶白 Cream'],
  },
  'color.name.lantern': {
    en: ['Lantern', 'Lantern', 'Lantern', 'Lantern', 'Lantern'],
    yue: ['燈籠金 Lantern', '燈籠金 Lantern', '燈籠金 Lantern', '燈籠金 Lantern', '燈籠金 Lantern'],
  },
  'color.name.berry': {
    en: ['Berry', 'Berry', 'Berry', 'Berry', 'Berry'],
    yue: ['莓紅 Berry', '莓紅 Berry', '莓紅 Berry', '莓紅 Berry', '莓紅 Berry'],
  },
  'color.name.sky': {
    en: ['Sky', 'Sky', 'Sky', 'Sky', 'Sky'],
    yue: ['天空藍 Sky', '天空藍 Sky', '天空藍 Sky', '天空藍 Sky', '天空藍 Sky'],
  },
  'color.name.dusk': {
    en: ['Dusk', 'Dusk', 'Dusk', 'Dusk', 'Dusk'],
    yue: ['黃昏紫 Dusk', '黃昏紫 Dusk', '黃昏紫 Dusk', '黃昏紫 Dusk', '黃昏紫 Dusk'],
  },

  // =========================================================================
  // the search field and its regex builder
  // =========================================================================

  'search.clear': {
    en: ['Clear the search', 'Clear the search', 'Clear the search', 'Wipe the search', 'Wipe the search and start afresh'],
    yue: ['清除搜尋', '清除搜尋', '清走個搜尋', '抹走個搜尋', '抹走個搜尋，由頭嚟過'],
  },
  'search.mode.plain': {
    en: ['Plain text', 'Plain text', 'Plain text', 'Just plain text', 'Just plain honest text'],
    yue: ['純文字', '純文字', '普通文字', '就係普通文字', '就係普通文字，冇花冇假'],
  },
  'search.mode.regex': {
    en: ['Regular expression', 'Regular expression', 'Regular expression', 'Regular expression, if you dare', 'Regular expression, for the brave'],
    yue: ['正則表達式', '正則表達式', '正則表達式', '正則表達式，夠膽就用', '正則表達式，勇者專用'],
  },
  'search.mode.hint': {
    en: [
      'Plain text is the default. Turn on regex to write a pattern.',
      'Plain text is the default. Turn on regex to write a pattern.',
      'Plain text unless you say otherwise — flip regex on to write a real pattern.',
      'Plain text unless you say otherwise. Flip regex on and write a real pattern.',
      'Plain text unless you say otherwise. Flip regex on and the full machinery awaits you.',
    ],
    yue: [
      '預設係純文字。開咗 regex 先可以寫 pattern。',
      '預設係純文字。開咗 regex 先可以寫 pattern。',
      '唔講就係純文字——扭開 regex 就可以寫真嘅 pattern。',
      '唔講就係純文字。扭開 regex，就可以寫真嘅 pattern。',
      '唔講就係純文字。扭開 regex，成套機器就等緊你。',
    ],
  },
  'search.results': {
    en: ['{count} results', '{count} results', '{count} results', '{count} results found', '{count} results, hunted down and presented'],
    yue: ['{count} 個結果', '{count} 個結果', '搵到 {count} 個結果', '搵到 {count} 個結果', '搵到 {count} 個結果，逐個捉返嚟排好'],
  },
  'search.results.none': {
    en: ['Nothing matches {query}.', 'Nothing matches {query}.', 'Nothing matches {query}.', 'Not one thing matches {query}.', 'Not one single thing answers to {query}.'],
    yue: ['冇嘢啱 {query}。', '冇嘢啱 {query}。', '冇嘢啱 {query} 喎。', '一件都冇啱 {query}。', '搵勻晒都冇一件應 {query} 呢個名。'],
  },
  'search.builder.open': {
    en: ['Open the pattern builder', 'Open the pattern builder', 'Open the pattern builder', 'Open the pattern builder', 'Summon the pattern builder'],
    yue: ['開 pattern 建構器', '開 pattern 建構器', '開個 pattern 建構器', '開個 pattern 建構器', '召喚 pattern 建構器出嚟'],
  },
  'search.builder.close': {
    en: ['Close the pattern builder', 'Close the pattern builder', 'Close the pattern builder', 'Put the pattern builder away', 'Dismiss the pattern builder, with thanks'],
    yue: ['閂 pattern 建構器', '閂 pattern 建構器', '閂咗個 pattern 建構器', '收埋個 pattern 建構器', '多謝晒，pattern 建構器請回'],
  },
  'regex.title': {
    en: ['Pattern builder', 'Pattern builder', 'Pattern builder', 'Pattern builder', 'The pattern builder, at your service'],
    yue: ['Pattern 建構器', 'Pattern 建構器', 'Pattern 建構器', 'Pattern 建構器', 'Pattern 建構器，隨時候命'],
  },
  'regex.dialect': {
    en: [
      'Dialect: {dialect}.',
      'Dialect: {dialect}.',
      'This builds a {dialect} pattern.',
      'This builds a {dialect} pattern, and nothing else.',
      'This builds a {dialect} pattern, and nothing else. No lookbehind fantasies.',
    ],
    yue: [
      '方言：{dialect}。',
      '方言：{dialect}。',
      '呢度整嘅係 {dialect} pattern。',
      '呢度淨係整 {dialect} pattern，冇第二款。',
      '呢度淨係整 {dialect} pattern，冇第二款。唔好發夢諗其他語法。',
    ],
  },
  'regex.pattern.label': {
    en: ['Pattern', 'Pattern', 'The pattern', 'The pattern itself', 'The pattern itself, raw and unashamed'],
    yue: ['Pattern', 'Pattern', '個 pattern', '個 pattern 本身', '個 pattern 本身，原汁原味'],
  },
  'regex.pattern.placeholder': {
    en: ['Type a pattern', 'Type a pattern', 'Type a pattern', 'Type a pattern, or build one below', 'Type a pattern, or let the builder below do the work'],
    yue: ['打個 pattern', '打個 pattern', '打個 pattern', '打個 pattern，或者用下面個建構器', '打個 pattern，或者放低雙手，畀下面個建構器代勞'],
  },
  'regex.flags.label': {
    en: ['Flags', 'Flags', 'Flags', 'Flags', 'Flags, the small print of a pattern'],
    yue: ['Flags', 'Flags', 'Flags', 'Flags', 'Flags，pattern 嘅細字條款'],
  },
  'regex.flag.i': {
    en: ['Ignore case', 'Ignore case', 'Ignore upper and lower case', 'Do not care about case', 'Treat upper and lower case as the same thing'],
    yue: ['唔理大細楷', '唔理大細楷', '大細楷當一樣', '大細楷唔理佢', '大細楷一視同仁，當同一樣嘢'],
  },
  'regex.flag.g': {
    en: ['Find all matches', 'Find all matches', 'Find every match', 'Find every last match', 'Hunt down every last match'],
    yue: ['搵晒所有配對', '搵晒所有配對', '搵晒每一個配對', '一個配對都唔放過', '掘地三尺，一個配對都唔放過'],
  },
  'regex.flag.m': {
    en: ['Multiline anchors', 'Multiline anchors', 'Anchors match each line', 'Anchors match each line, not just the whole text', 'Anchors bite at each line, not just the whole text'],
    yue: ['多行錨點', '多行錨點', '錨點對每一行都生效', '錨點對每一行生效，唔淨係成段', '錨點喺每一行都咬一啖，唔淨係成段'],
  },
  'regex.flag.s': {
    en: ['Dot matches newline', 'Dot matches newline', 'The dot matches a newline too', 'The dot swallows newlines too', 'The dot swallows newlines too, greedily'],
    yue: ['點號配對換行', '點號配對換行', '個點連換行都夾埋', '個點連換行都吞埋', '個點連換行都一啖吞埋，好貪心'],
  },
  'regex.flag.u': {
    en: ['Unicode', 'Unicode', 'Full Unicode', 'Full Unicode, emoji and all', 'Full Unicode, emoji, accents and all'],
    yue: ['Unicode', 'Unicode', '完整 Unicode', '完整 Unicode，連 emoji 都得', '完整 Unicode，emoji、重音符號，樣樣都得'],
  },
  'regex.flag.y': {
    en: ['Sticky', 'Sticky', 'Sticky — match from where it left off', 'Sticky: carry on from where it left off', 'Sticky: it carries on stubbornly from where it left off'],
    yue: ['黏著模式', '黏著模式', '黏著——由上次停低嗰度繼續', '黏著：由上次停低嗰度繼續', '黏著：死心不息，由上次停低嗰度繼續'],
  },
  'regex.piece.literal': {
    en: ['Literal text', 'Literal text', 'Literal text', 'Just this exact text', 'Exactly this text, character for character'],
    yue: ['字面文字', '字面文字', '字面文字', '就係呢啲字', '一個字都唔差，就係呢啲字'],
  },
  'regex.piece.charclass': {
    en: ['Character class', 'Character class', 'Any one of these characters', 'Any one of these characters', 'Any one character out of this little committee'],
    yue: ['字元類別', '字元類別', '呢啲字元入面任何一個', '呢堆字元揀一個', '呢個小組委員會入面，隨便一個字元'],
  },
  'regex.piece.any': {
    en: ['Any character', 'Any character', 'Any character at all', 'Any character at all', 'Absolutely any character at all'],
    yue: ['任何字元', '任何字元', '任何一個字元都得', '乜字元都得', '乜字元都得，一個都唔挑'],
  },
  'regex.piece.digit': {
    en: ['A digit', 'A digit', 'A digit', 'A digit, zero to nine', 'A digit, zero through nine, no exceptions'],
    yue: ['數字', '數字', '一個數字', '一個數字，零到九', '一個數字，零到九，冇例外'],
  },
  'regex.piece.word': {
    en: ['A word character', 'A word character', 'A word character', 'A letter, digit or underscore', 'A letter, a digit or a humble underscore'],
    yue: ['字詞字元', '字詞字元', '一個字詞字元', '字母、數字或者底線', '字母、數字，或者卑微嘅底線'],
  },
  'regex.piece.space': {
    en: ['Whitespace', 'Whitespace', 'Whitespace', 'A space, tab or newline', 'A space, a tab or a newline — the invisible ones'],
    yue: ['空白字元', '空白字元', '空白字元', '空格、tab 或者換行', '空格、tab、換行——啲睇唔見嗰啲'],
  },
  'regex.piece.anchor.start': {
    en: ['Start of text', 'Start of text', 'Start of the text', 'Right at the start', 'Right at the very start, and nowhere else'],
    yue: ['文字開頭', '文字開頭', '文字開頭', '一開頭嗰度', '就喺最開頭嗰度，第二度都唔得'],
  },
  'regex.piece.anchor.end': {
    en: ['End of text', 'End of text', 'End of the text', 'Right at the end', 'Right at the very end, and nowhere else'],
    yue: ['文字結尾', '文字結尾', '文字結尾', '最尾嗰度', '就喺最尾嗰度，第二度都唔得'],
  },
  'regex.piece.wordboundary': {
    en: ['Word boundary', 'Word boundary', 'The edge of a word', 'The edge of a word', 'The invisible line at the edge of a word'],
    yue: ['字詞邊界', '字詞邊界', '一個字嘅邊', '一個字嘅邊界', '一個字邊緣嗰條睇唔見嘅線'],
  },
  'regex.piece.group': {
    en: ['Group', 'Group', 'Group', 'Group them together', 'Bundle them together as one'],
    yue: ['群組', '群組', '群組', '將佢哋圈埋一齊', '將佢哋捆做一嚿'],
  },
  'regex.piece.capture': {
    en: ['Capturing group', 'Capturing group', 'Capture this part', 'Capture this part for later', 'Capture this part and keep it for later'],
    yue: ['捕獲群組', '捕獲群組', '捉住呢部分', '捉住呢部分，一陣有用', '捉住呢部分，收好，一陣有大用'],
  },
  'regex.piece.noncapture': {
    en: ['Non-capturing group', 'Non-capturing group', 'Group it without capturing', 'Group it, but do not keep it', 'Group it, but do not bother keeping it'],
    yue: ['非捕獲群組', '非捕獲群組', '圈埋佢但唔捉', '圈埋佢，但唔使留低', '圈埋佢，但唔使留低，唔緊要'],
  },
  'regex.piece.alternation': {
    en: ['Either or', 'Either or', 'This or that', 'This one or that one', 'This one, or that one — the pattern will not mind'],
    yue: ['二揀一', '二揀一', '呢個或者嗰個', '呢個定嗰個都得', '呢個定嗰個都得，個 pattern 唔會嬲'],
  },
  'regex.piece.quantifier': {
    en: ['Repeat', 'Repeat', 'Repeat it', 'How many times?', 'How many times shall it repeat?'],
    yue: ['重複', '重複', '重複佢', '重複幾多次？', '要重複幾多次先夠？'],
  },
  'regex.quantifier.optional': {
    en: ['Once or not at all', 'Once or not at all', 'Once, or not at all', 'Once, or not at all', 'Once, or not at all — no pressure'],
    yue: ['有或者冇', '有或者冇', '一次，或者冇', '一次，或者索性冇', '一次，或者索性冇——唔勉強'],
  },
  'regex.quantifier.some': {
    en: ['One or more', 'One or more', 'One or more', 'At least one', 'At least one, and as many as it likes'],
    yue: ['一個或以上', '一個或以上', '一個或者更多', '最少一個', '最少一個，鍾意幾多個都得'],
  },
  'regex.quantifier.any': {
    en: ['Zero or more', 'Zero or more', 'Any number, including none', 'Any number at all, including none', 'Any number at all, none very much included'],
    yue: ['零個或以上', '零個或以上', '幾多個都得，冇都得', '幾多個都得，一個都冇都得', '幾多個都得，一個都冇都完全 OK'],
  },
  'regex.quantifier.exact': {
    en: ['Exactly {count}', 'Exactly {count}', 'Exactly {count} times', 'Exactly {count} times, no more', 'Exactly {count} times, not one more, not one fewer'],
    yue: ['啱啱 {count} 次', '啱啱 {count} 次', '啱啱 {count} 次', '啱啱 {count} 次，唔多唔少', '啱啱 {count} 次，多一次都唔得，少一次都唔得'],
  },
  'regex.quantifier.range': {
    en: ['{min} to {max} times', '{min} to {max} times', '{min} to {max} times', 'Between {min} and {max} times', 'Somewhere between {min} and {max} times, inclusive'],
    yue: ['{min} 到 {max} 次', '{min} 到 {max} 次', '{min} 到 {max} 次', '{min} 至 {max} 次之間', '{min} 至 {max} 次之間，兩頭都計埋'],
  },
  'regex.piece.add': {
    en: ['Add {piece}', 'Add {piece}', 'Add {piece}', 'Add {piece} to the pattern', 'Add {piece} to the growing pattern'],
    yue: ['加 {piece}', '加 {piece}', '加個 {piece}', '將 {piece} 加落 pattern', '將 {piece} 加落個越嚟越長嘅 pattern 度'],
  },
  'regex.piece.remove': {
    en: ['Remove {piece}', 'Remove {piece}', 'Take {piece} out', 'Take {piece} back out', 'Escort {piece} out of the pattern'],
    yue: ['移除 {piece}', '移除 {piece}', '將 {piece} 抽走', '將 {piece} 抽返出嚟', '請 {piece} 離開個 pattern'],
  },
  'regex.piece.moveUp': {
    en: ['Move {piece} earlier', 'Move {piece} earlier', 'Move {piece} earlier', 'Shift {piece} earlier', 'Shuffle {piece} one place earlier'],
    yue: ['將 {piece} 移前', '將 {piece} 移前', '{piece} 推前啲', '{piece} 郁前啲', '{piece} 向前挪一格'],
  },
  'regex.piece.moveDown': {
    en: ['Move {piece} later', 'Move {piece} later', 'Move {piece} later', 'Shift {piece} later', 'Shuffle {piece} one place later'],
    yue: ['將 {piece} 移後', '將 {piece} 移後', '{piece} 推後啲', '{piece} 郁後啲', '{piece} 向後挪一格'],
  },
  'regex.sample.label': {
    en: ['Sample text', 'Sample text', 'Sample text to try it on', 'Something to try it on', 'A victim to try the pattern on'],
    yue: ['樣本文字', '樣本文字', '攞嚟試嘅樣本文字', '搵啲嘢畀佢試下', '搵個犧牲品畀個 pattern 試下'],
  },
  'regex.sample.placeholder': {
    en: ['Paste some text here', 'Paste some text here', 'Paste some text here', 'Paste anything here', 'Paste anything at all here'],
    yue: ['喺呢度貼啲字', '喺呢度貼啲字', '喺呢度貼啲字入嚟', '貼啲乜都得入嚟', '乜都得，貼入嚟就係'],
  },
  'regex.sample.limit': {
    en: [
      'The sample is limited to {max} characters.',
      'The sample is limited to {max} characters.',
      'The sample stops at {max} characters.',
      'The sample stops at {max} characters, for everyone’s sake.',
      'The sample stops dead at {max} characters, for the good of us all.',
    ],
    yue: [
      '樣本最多 {max} 個字元。',
      '樣本最多 {max} 個字元。',
      '樣本去到 {max} 個字元就停。',
      '樣本去到 {max} 個字元就停，為大家好。',
      '樣本去到 {max} 個字元就即刻剎車，為咗大家好。',
    ],
  },
  'regex.sample.truncatedInput': {
    en: ['The sample was cut to {max} characters.', 'The sample was cut to {max} characters.', 'The sample was trimmed to {max} characters.', 'The sample was trimmed down to {max} characters.', 'The sample was trimmed down to {max} characters. The rest is on the cutting room floor.'],
    yue: ['樣本剪到 {max} 個字元。', '樣本剪到 {max} 個字元。', '樣本剪短咗做 {max} 個字元。', '樣本剪短咗做 {max} 個字元。', '樣本剪短咗做 {max} 個字元，其餘嘅喺剪片室地下。'],
  },
  'regex.matches': {
    en: ['{count} matches', '{count} matches', '{count} matches', '{count} matches found', '{count} matches, rounded up and counted'],
    yue: ['{count} 個配對', '{count} 個配對', '搵到 {count} 個配對', '搵到 {count} 個配對', '{count} 個配對，圍晒埋數清楚'],
  },
  'regex.matches.none': {
    en: ['No matches.', 'No matches.', 'Nothing matched.', 'Nothing matched at all.', 'Nothing matched. Not one character volunteered.'],
    yue: ['冇配對。', '冇配對。', '一個都冇配到。', '一個都冇配到喎。', '一個都冇。連一粒字都唔肯出嚟認頭。'],
  },
  'regex.matches.truncated': {
    en: [
      'Showing the first {shown} of {limit}.',
      'Showing the first {shown} of {limit}.',
      'Showing the first {shown} — the limit is {limit}.',
      'Showing the first {shown}; the limit is {limit} and we hit it.',
      'Showing the first {shown}; the limit is {limit}, and we walked straight into it.',
    ],
    yue: [
      '顯示頭 {shown} 個，上限 {limit}。',
      '顯示頭 {shown} 個，上限 {limit}。',
      '顯示頭 {shown} 個——上限係 {limit}。',
      '顯示頭 {shown} 個；上限 {limit}，撞到晒。',
      '顯示頭 {shown} 個；上限 {limit}，我哋一頭撞埋去。',
    ],
  },
  'regex.timeout': {
    en: [
      'The pattern was stopped after {ms} ms.',
      'The pattern was stopped after {ms} ms.',
      'The pattern was taking too long and was stopped after {ms} ms.',
      'The pattern went off wandering and was stopped after {ms} ms.',
      'The pattern wandered off into the wilderness and was hauled back after {ms} ms.',
    ],
    yue: [
      '個 pattern 跑咗 {ms} 毫秒之後被停止。',
      '個 pattern 跑咗 {ms} 毫秒之後被停止。',
      '個 pattern 行得太耐，跑咗 {ms} 毫秒就叫停。',
      '個 pattern 遊魂咗，跑咗 {ms} 毫秒就叫停佢。',
      '個 pattern 遊魂到入咗荒野，{ms} 毫秒後畀人捉返嚟。',
    ],
  },
  'regex.match.at': {
    en: ['Match at {index}: {text}', 'Match at {index}: {text}', 'Match at {index}: {text}', 'A match at {index}: {text}', 'A match, right at {index}: {text}'],
    yue: ['喺 {index} 配到：{text}', '喺 {index} 配到：{text}', '喺 {index} 位置配到：{text}', '喺 {index} 位置捉到一個：{text}', '就喺 {index} 位置捉到一個：{text}'],
  },
  'regex.match.empty': {
    en: ['Empty match at {index}', 'Empty match at {index}', 'An empty match at {index}', 'An empty match at {index} — it matched nothing at all', 'An empty match at {index}: it matched precisely nothing, and was proud of it'],
    yue: ['喺 {index} 有個空配對', '喺 {index} 有個空配對', '喺 {index} 配到個空嘅', '喺 {index} 配到個空嘅——即係乜都冇配到', '喺 {index} 配到個空嘅：乜都冇配到，仲要好威'],
  },
  'regex.group.numbered': {
    en: ['Group {n}: {text}', 'Group {n}: {text}', 'Group {n}: {text}', 'Group {n} caught: {text}', 'Group {n} came back holding: {text}'],
    yue: ['第 {n} 組：{text}', '第 {n} 組：{text}', '第 {n} 組：{text}', '第 {n} 組捉到：{text}', '第 {n} 組凱旋歸來，手上揸住：{text}'],
  },
  'regex.group.named': {
    en: ['Group {name}: {text}', 'Group {name}: {text}', 'Group {name}: {text}', 'Group {name} caught: {text}', 'Group {name} came back holding: {text}'],
    yue: ['{name} 組：{text}', '{name} 組：{text}', '{name} 組：{text}', '{name} 組捉到：{text}', '{name} 組凱旋歸來，手上揸住：{text}'],
  },
  'regex.valid': {
    en: ['The pattern is valid.', 'The pattern is valid.', 'The pattern is good.', 'The pattern is good to go.', 'The pattern is in perfect health.'],
    yue: ['個 pattern 正確。', '個 pattern 正確。', '個 pattern 冇問題。', '個 pattern 冇問題，用得。', '個 pattern health 爆燈，用得。'],
  },
  'regex.error': {
    en: ['The pattern is not valid: {error}', 'The pattern is not valid: {error}', 'That pattern does not work: {error}', 'That pattern is broken: {error}', 'That pattern is a shambles, and here is why: {error}'],
    yue: ['個 pattern 唔正確：{error}', '個 pattern 唔正確：{error}', '呢個 pattern 用唔到：{error}', '呢個 pattern 壞咗：{error}', '呢個 pattern 亂到冇朋友，原因係：{error}'],
  },
  'regex.error.at': {
    en: ['The pattern is not valid at character {index}: {error}', 'The pattern is not valid at character {index}: {error}', 'The pattern breaks at character {index}: {error}', 'The pattern falls over at character {index}: {error}', 'The pattern falls flat on its face at character {index}: {error}'],
    yue: ['個 pattern 喺第 {index} 個字元出錯：{error}', '個 pattern 喺第 {index} 個字元出錯：{error}', '個 pattern 喺第 {index} 個字元爆咗：{error}', '個 pattern 喺第 {index} 個字元冧咗：{error}', '個 pattern 喺第 {index} 個字元一嘢仆街：{error}'],
  },
  'regex.empty': {
    en: ['An empty pattern matches everything.', 'An empty pattern matches everything.', 'An empty pattern matches everything, so nothing is filtered.', 'An empty pattern matches everything, which filters precisely nothing.', 'An empty pattern matches everything, which is a grand way of filtering nothing at all.'],
    yue: ['空嘅 pattern 會配到所有嘢。', '空嘅 pattern 會配到所有嘢。', '空嘅 pattern 乜都配到，即係冇篩到嘢。', '空嘅 pattern 乜都配到，等於一啲都冇篩。', '空嘅 pattern 乜都配到，即係好大陣仗噉篩咗個吉。'],
  },
  'regex.escape.note': {
    en: [
      'Plain text is escaped for you: {chars} lose their special meaning.',
      'Plain text is escaped for you: {chars} lose their special meaning.',
      'In plain mode we escape it for you, so {chars} lose their special meaning.',
      'In plain mode we escape it for you, so {chars} behave like ordinary characters.',
      'In plain mode we escape it for you, so {chars} are stripped of their powers and behave.',
    ],
    yue: [
      '純文字模式會自動 escape：{chars} 會失去特殊意思。',
      '純文字模式會自動 escape：{chars} 會失去特殊意思。',
      '純文字模式會幫你 escape，所以 {chars} 冇咗特殊意思。',
      '純文字模式會幫你 escape，所以 {chars} 會乖乖當普通字元。',
      '純文字模式會幫你 escape，{chars} 一律被廢武功，乖乖做普通字元。',
    ],
  },
  'regex.copy': {
    en: ['Copy the pattern', 'Copy the pattern', 'Copy the pattern', 'Grab a copy of the pattern', 'Take a copy of this fine pattern'],
    yue: ['複製個 pattern', '複製個 pattern', 'Copy 個 pattern', 'Copy 低個 pattern', 'Copy 低呢個靚 pattern'],
  },
  'regex.export': {
    en: ['Export the pattern and matches', 'Export the pattern and matches', 'Export the pattern and its matches', 'Export the pattern and everything it caught', 'Export the pattern and every last thing it caught'],
    yue: ['匯出 pattern 同配對', '匯出 pattern 同配對', '匯出個 pattern 同啲配對', '匯出個 pattern 同佢捉到嘅嘢', '匯出個 pattern 同佢捉到嘅每一件嘢'],
  },
  'regex.notPersisted': {
    en: [
      'Patterns are not saved. This one lives only while the field is open.',
      'Patterns are not saved. This one lives only while the field is open.',
      'Patterns are never saved — this one lives only while the field is open.',
      'Patterns are never saved. This one exists only while the field is open.',
      'Patterns are never saved. This one exists only while the field is open, then vanishes without trace.',
    ],
    yue: [
      'Pattern 唔會儲存，得個搜尋欄開住嗰陣先存在。',
      'Pattern 唔會儲存，得個搜尋欄開住嗰陣先存在。',
      'Pattern 永遠唔會儲存——得個搜尋欄開住嗰陣先存在。',
      'Pattern 永遠唔會儲存，個搜尋欄一閂佢就唔存在。',
      'Pattern 永遠唔會儲存，個搜尋欄一閂，佢就人間蒸發，一絲痕跡都冇。',
    ],
  },

  // =========================================================================
  // the search catalogue
  // =========================================================================

  'catalogue.title': {
    en: ['Search surfaces', 'Search surfaces', 'Every search in the app', 'Every search field in the app', 'Every last search field this app owns'],
    yue: ['搜尋介面一覽', '搜尋介面一覽', '成個 app 嘅搜尋', '成個 app 每個搜尋欄', '呢個 app 每一個搜尋欄，一個都唔漏'],
  },
  'catalogue.desc': {
    en: [
      'Every list, table, picker and menu has a search field, and each one is listed here.',
      'Every list, table, picker and menu has a search field, and each one is listed here.',
      'Every list, table, picker and menu has its own search field, and they are all listed here.',
      'Every list, table, picker and menu has its own search field, and not one of them escapes this list.',
      'Every list, table, picker and menu has its own search field, and not one of them escapes this list. We checked.',
    ],
    yue: [
      '每個清單、表格、揀選器同選單都有搜尋欄，全部列晒喺呢度。',
      '每個清單、表格、揀選器同選單都有搜尋欄，全部列晒喺呢度。',
      '每個清單、表格、揀選器同選單都有自己嘅搜尋欄，全部列晒喺呢度。',
      '每個清單、表格、揀選器同選單都有自己嘅搜尋欄，冇一個走得甩。',
      '每個清單、表格、揀選器同選單都有自己嘅搜尋欄，冇一個走得甩。我哋核對過。',
    ],
  },
  'catalogue.column.id': {
    en: ['Identifier', 'Identifier', 'Identifier', 'Identifier', 'Its identifier'],
    yue: ['識別碼', '識別碼', '識別碼', '識別碼', '佢個識別碼'],
  },
  'catalogue.column.where': {
    en: ['Where it lives', 'Where it lives', 'Where it lives', 'Where you will find it', 'Where in the world you will find it'],
    yue: ['喺邊度', '喺邊度', '喺邊度搵到', '喺邊度搵到佢', '喺呢個世界邊個角落搵到佢'],
  },
  'catalogue.column.what': {
    en: ['What it searches', 'What it searches', 'What it searches', 'What it actually searches', 'What it actually goes looking through'],
    yue: ['搜尋咩', '搜尋咩', '佢搵咩', '佢實際搵緊咩', '佢實際上喺度掘緊啲咩'],
  },
  'catalogue.count': {
    en: ['{count} search fields.', '{count} search fields.', '{count} search fields in total.', '{count} search fields, all present and correct.', '{count} search fields, all present, correct and accounted for.'],
    yue: ['{count} 個搜尋欄。', '{count} 個搜尋欄。', '總共 {count} 個搜尋欄。', '{count} 個搜尋欄，一個都齊。', '{count} 個搜尋欄，全部到齊，點名無誤。'],
  },
  'search.catalogue.label': {
    en: ['Search the catalogue', 'Search the catalogue', 'Search the catalogue of searches', 'Search the catalogue of searches', 'Search the catalogue of searches, which is admittedly funny'],
    yue: ['搜尋呢個一覽表', '搜尋呢個一覽表', '喺搜尋一覽表度搵嘢', '喺搜尋一覽表度搵嘢', '喺「搜尋一覽表」度搵搜尋，講出嚟都幾好笑'],
  },
  'search.catalogue.placeholder': {
    en: ['Search fields', 'Search fields', 'Search fields', 'Which search field?', 'Which search field are you after?'],
    yue: ['搜尋欄', '搜尋欄', '搵搜尋欄', '要邊個搜尋欄？', '你想搵邊個搜尋欄？'],
  },

  // =========================================================================
  // command palette
  // =========================================================================

  'palette.title': {
    en: ['Command palette', 'Command palette', 'Command palette', 'Command palette', 'The command palette, keeper of every shortcut'],
    yue: ['指令面板', '指令面板', '指令面板', '指令面板', '指令面板，掌管全部捷徑嗰個'],
  },
  'palette.label': {
    en: ['Search commands and places', 'Search commands and places', 'Search commands and places', 'Search every command and place', 'Search every command and every place worth going'],
    yue: ['搜尋指令同地方', '搜尋指令同地方', '搵指令同地方', '搵晒所有指令同地方', '搵晒所有指令，同埋所有值得去嘅地方'],
  },
  'palette.placeholder': {
    en: ['Type a command', 'Type a command', 'Type a command or a place', 'What do you want to do?', 'Say the word and it shall be done'],
    yue: ['打個指令', '打個指令', '打個指令或者地方', '你想做咩？', '講句話，即刻幫你搞掂'],
  },
  'palette.hint': {
    en: ['Open it with {keys}.', 'Open it with {keys}.', 'Open it any time with {keys}.', 'Open it any time with {keys}.', 'Summon it any time at all with {keys}.'],
    yue: ['用 {keys} 開。', '用 {keys} 開。', '幾時都可以用 {keys} 開。', '幾時都可以用 {keys} 開。', '幾時都可以用 {keys} 召喚佢出嚟。'],
  },
  'palette.group.commands': {
    en: ['Commands', 'Commands', 'Commands', 'Things to do', 'Things you could do right now'],
    yue: ['指令', '指令', '指令', '可以做嘅嘢', '而家即刻可以做嘅嘢'],
  },
  'palette.group.tabs': {
    en: ['Tabs', 'Tabs', 'Tabs', 'Tabs to jump to', 'Tabs waiting to be visited'],
    yue: ['分頁', '分頁', '分頁', '可以跳去嘅分頁', '等緊你臨幸嘅分頁'],
  },
  'palette.group.settings': {
    en: ['Settings', 'Settings', 'Settings', 'Settings to jump to', 'Settings waiting to be adjusted'],
    yue: ['設定', '設定', '設定', '可以跳去嘅設定', '等緊你去調校嘅設定'],
  },
  'palette.group.appearance': {
    en: ['Appearance', 'Appearance', 'Appearance', 'Things you can restyle', 'Things you can restyle to your heart’s content'],
    yue: ['外觀', '外觀', '外觀', '可以改樣嘅嘢', '任你改到心滿意足嘅嘢'],
  },
  'palette.group.docs': {
    en: ['Documentation', 'Documentation', 'Documentation', 'Things to read', 'Things to read on a quiet evening'],
    yue: ['說明文件', '說明文件', '說明文件', '可以睇嘅嘢', '得閒夜晚攤開嚟慢慢睇嘅嘢'],
  },
  'palette.group.history': {
    en: ['History', 'History', 'History', 'What you have done', 'Everything you have already done'],
    yue: ['歷史', '歷史', '歷史', '你做過啲咩', '你做過嘅所有嘢'],
  },
  'palette.empty': {
    en: ['Nothing matches {query}.', 'Nothing matches {query}.', 'Nothing matches {query}.', 'Nothing at all matches {query}.', 'Nothing whatsoever answers to {query}.'],
    yue: ['冇嘢啱 {query}。', '冇嘢啱 {query}。', '冇嘢啱 {query} 喎。', '一件都冇啱 {query}。', '成個 app 都冇嘢應 {query} 呢個名。'],
  },
  'palette.count': {
    en: ['{count} results', '{count} results', '{count} results', '{count} results ready', '{count} results, lined up and waiting'],
    yue: ['{count} 個結果', '{count} 個結果', '{count} 個結果', '{count} 個結果，準備好', '{count} 個結果，排好隊等你'],
  },
  'palette.run': {
    en: ['Run {title}', 'Run {title}', 'Run {title}', 'Go on then, run {title}', 'Unleash {title} upon the world'],
    yue: ['執行 {title}', '執行 {title}', '行 {title}', '行 {title} 啦', '放 {title} 出嚟，睇下咩事'],
  },
  'palette.goto': {
    en: ['Go to {title}', 'Go to {title}', 'Go to {title}', 'Take me to {title}', 'Whisk me away to {title}'],
    yue: ['去 {title}', '去 {title}', '跳去 {title}', '帶我去 {title}', '快啲送我去 {title}'],
  },
  'palette.regexToggle': {
    en: ['Match with a regular expression', 'Match with a regular expression', 'Match with a regular expression', 'Match with a regular expression instead', 'Match with a full regular expression, if you insist'],
    yue: ['用正則表達式配對', '用正則表達式配對', '改用正則表達式配對', '改用正則表達式配對啦', '你堅持嘅話，就用足正則表達式配對'],
  },

  // ---- commands -----------------------------------------------------------

  'cmd.openSettings': {
    en: ['Open settings', 'Open settings', 'Open settings', 'Open the settings', 'Fling open the settings'],
    yue: ['開設定', '開設定', '開設定', '打開設定', '一嘢推開道設定門'],
  },
  'cmd.openAlmanac': {
    en: ['Open the almanac', 'Open the almanac', 'Open the almanac', 'Open the almanac', 'Open the almanac and read up'],
    yue: ['開農民曆', '開農民曆', '開農民曆', '打開農民曆', '打開農民曆，好好研究下'],
  },
  'cmd.openChangelog': {
    en: ['Open the changelog', 'Open the changelog', 'Open the changelog', 'Open the changelog', 'Open the changelog and see what changed'],
    yue: ['開更新紀錄', '開更新紀錄', '開更新紀錄', '打開更新紀錄', '打開更新紀錄，睇下改咗啲乜'],
  },
  'cmd.openHistory': {
    en: ['Open the history', 'Open the history', 'Open the history', 'Open your history', 'Open your history and face the past'],
    yue: ['開歷史紀錄', '開歷史紀錄', '開歷史紀錄', '打開你嘅歷史紀錄', '打開歷史紀錄，面對過去'],
  },
  'cmd.focusFarm': {
    en: ['Go to the farm', 'Go to the farm', 'Back to the farm', 'Back to the farm', 'Back to the farm, where the work is'],
    yue: ['去農場', '去農場', '返去塊田', '返去塊田度', '返去塊田度，做嘢喇'],
  },
  'cmd.newTab': {
    en: ['New tab', 'New tab', 'Open a new tab', 'Open a new tab', 'Open a brand new tab'],
    yue: ['新分頁', '開新分頁', '開個新分頁', '開個新分頁', '開個全新分頁'],
  },
  'cmd.closeTab': {
    en: ['Close this tab', 'Close this tab', 'Close this tab', 'Close this tab', 'Close this tab and be done with it'],
    yue: ['閂呢個分頁', '閂呢個分頁', '閂咗呢個分頁', '閂咗呢個分頁', '閂咗呢個分頁，一了百了'],
  },
  'cmd.nextTab': {
    en: ['Next tab', 'Next tab', 'Next tab', 'On to the next tab', 'On to the next tab, quickly'],
    yue: ['下一個分頁', '下一個分頁', '下一個分頁', '去下一個分頁', '快啲去下一個分頁'],
  },
  'cmd.prevTab': {
    en: ['Previous tab', 'Previous tab', 'Previous tab', 'Back to the last tab', 'Back to the last tab, quickly'],
    yue: ['上一個分頁', '上一個分頁', '上一個分頁', '返去上一個分頁', '快啲返去上一個分頁'],
  },
  'cmd.setLang': {
    en: ['Switch to {lang}', 'Switch to {lang}', 'Switch to {lang}', 'Switch over to {lang}', 'Switch the whole app over to {lang}'],
    yue: ['轉做 {lang}', '轉做 {lang}', '轉做 {lang}', '轉晒做 {lang}', '成個 app 轉晒做 {lang}'],
  },
  'cmd.funnyUp': {
    en: ['Funnier', 'Funnier', 'Make it funnier', 'Turn the funny up', 'Turn the funny up and stand well back'],
    yue: ['再好笑啲', '再好笑啲', '搞笑啲', '搞笑程度扭高啲', '搞笑程度扭高，記得企開啲'],
  },
  'cmd.funnyDown': {
    en: ['Less funny', 'Less funny', 'Make it plainer', 'Turn the funny down', 'Turn the funny down and let us all breathe'],
    yue: ['冇咁好笑', '冇咁好笑', '平實啲', '搞笑程度扭低啲', '搞笑程度扭低，畀大家唞下氣'],
  },
  'cmd.toggleMute': {
    en: ['Mute or unmute', 'Mute or unmute', 'Mute or unmute', 'Silence it, or bring it back', 'Silence the valley, or wake it up again'],
    yue: ['靜音或者解除靜音', '靜音或者解除靜音', '靜音／出返聲', '收聲，或者出返聲', '成個山谷收聲，或者叫醒佢'],
  },
  'cmd.toggleMotion': {
    en: ['Toggle reduced motion', 'Toggle reduced motion', 'Turn reduced motion on or off', 'Calm the motion down, or let it loose', 'Calm the motion down, or let the whole valley sway again'],
    yue: ['切換減少動態', '切換減少動態', '開／閂減少動態', '郁少啲，或者放佢自由', '郁少啲，或者放成個山谷出嚟搖'],
  },
  'cmd.zoomIn': {
    en: ['Increase the scale', 'Increase the scale', 'Make everything bigger', 'Make everything bigger', 'Make everything gloriously bigger'],
    yue: ['放大比例', '放大比例', '啲嘢大啲', '所有嘢大啲', '所有嘢大到氣勢磅礡'],
  },
  'cmd.zoomOut': {
    en: ['Decrease the scale', 'Decrease the scale', 'Make everything smaller', 'Make everything smaller', 'Make everything modestly smaller'],
    yue: ['縮細比例', '縮細比例', '啲嘢細啲', '所有嘢細啲', '所有嘢謙虛啲，細返少少'],
  },
  'cmd.zoomReset': {
    en: ['Reset the scale', 'Reset the scale', 'Back to the normal scale', 'Back to the normal scale', 'Back to the normal scale, and no arguing'],
    yue: ['重設比例', '重設比例', '返返正常比例', '返返正常比例', '返返正常比例，唔准駁嘴'],
  },
  'cmd.exportData': {
    en: ['Export data', 'Export data', 'Export your data', 'Take a copy of everything', 'Pack it all up and take it with you'],
    yue: ['匯出資料', '匯出資料', '匯出你啲資料', 'Copy 晒所有嘢走', '打包晒所有嘢帶走'],
  },
  'cmd.resetAll': {
    en: ['Reset everything', 'Reset everything', 'Reset everything', 'Wipe the lot', 'Wipe the lot and start from nothing'],
    yue: ['重設所有嘢', '重設所有嘢', '所有嘢重設', '一鋪清晒', '一鋪清袋，由零開始'],
  },
  'cmd.copyDiagnostics': {
    en: ['Copy diagnostics', 'Copy diagnostics', 'Copy the diagnostics', 'Copy the diagnostics', 'Copy the diagnostics, for when things go wrong'],
    yue: ['複製診斷資料', '複製診斷資料', 'Copy 診斷資料', 'Copy 低啲診斷資料', 'Copy 低啲診斷資料，出事嗰陣有用'],
  },
  'cmd.surprise': {
    en: ['Show the surprise', 'Show the surprise', 'Show the surprise', 'Show me the surprise', 'Show me the surprise, I have earned it'],
    yue: ['睇下驚喜', '睇下驚喜', '睇下個驚喜', '畀個驚喜我睇', '畀個驚喜我睇，我應得㗎'],
  },
  'cmd.minimise': {
    en: ['Minimise the window', 'Minimise the window', 'Minimise the window', 'Tuck the window away', 'Send the window away for a moment'],
    yue: ['縮細個窗', '縮細個窗', '縮細個窗', '收埋個窗先', '叫個窗行開一陣'],
  },
  'cmd.maximise': {
    en: ['Maximise the window', 'Maximise the window', 'Fill the screen', 'Take the whole screen', 'Seize the entire screen'],
    yue: ['最大化個窗', '放大個窗', '霸晒成個 mon', '成個 mon 都要', '一鋪過霸晒成塊 mon'],
  },
  'cmd.closeWindow': {
    en: ['Close the window', 'Close the window', 'Close the window', 'Close the window', 'Close the window and call it a day'],
    yue: ['閂個窗', '閂個窗', '閂咗個窗', '閂窗收工', '閂窗收工，今日就咁'],
  },

  // =========================================================================
  // notifications and dialogs
  // =========================================================================

  'notify.region.label': {
    en: ['Notifications', 'Notifications', 'Notifications', 'Notifications', 'Notifications, stacked politely'],
    yue: ['通知', '通知', '通知', '通知', '通知，好有禮貌咁疊住'],
  },
  'notify.dismiss': {
    en: ['Dismiss', 'Dismiss', 'Dismiss this', 'Away with it', 'Away with it, we have all read it'],
    yue: ['關閉', '收咗佢', '收咗佢', '走啦', '走啦，大家都睇完喇'],
  },
  'notify.dismissAll': {
    en: ['Dismiss all', 'Dismiss all', 'Dismiss them all', 'Clear the whole stack', 'Clear the whole stack in one sweep'],
    yue: ['全部關閉', '全部收咗', '全部收咗佢', '成疊清晒', '成疊一鋪過清晒'],
  },
  'notify.paused': {
    en: ['Paused while you read it.', 'Paused while you read it.', 'Paused while you read it.', 'It will wait while you read it.', 'It will wait patiently while you read it. Take your time.'],
    yue: ['你睇緊嗰陣會暫停。', '你睇緊嗰陣會暫停。', '你睇緊嗰陣佢會等你。', '你睇緊嗰陣佢會等你。', '你睇緊嗰陣佢會好有耐性咁等你。慢慢啦。'],
  },
  'notify.progress': {
    en: ['{label}: {percent}%', '{label}: {percent}%', '{label} — {percent}%', '{label}, {percent}% of the way there', '{label}, {percent}% of the way there and going strong'],
    yue: ['{label}：{percent}%', '{label}：{percent}%', '{label} — {percent}%', '{label}，行咗 {percent}%', '{label}，行咗 {percent}%，仲好精神'],
  },
  'notify.progress.done': {
    en: ['{label} finished.', '{label} finished.', '{label} is done.', '{label} is done and dusted.', '{label} is done, dusted and filed away.'],
    yue: ['{label} 完成。', '{label} 完成。', '{label} 搞掂。', '{label} 搞掂晒。', '{label} 搞掂晒，仲執埋位。'],
  },
  'notify.success': {
    en: ['Done.', 'Done.', 'Done.', 'All done.', 'All done, and rather neatly too.'],
    yue: ['搞掂。', '搞掂。', '搞掂喇。', '全部搞掂。', '全部搞掂，仲要做得幾靚。'],
  },
  'notify.failure': {
    en: ['That failed: {error}', 'That failed: {error}', 'That did not work: {error}', 'That fell over: {error}', 'That fell over spectacularly: {error}'],
    yue: ['失敗咗：{error}', '失敗咗：{error}', '搞唔掂：{error}', '仆咗街：{error}', '轟轟烈烈咁仆咗街：{error}'],
  },
  'dialog.confirm.title': {
    en: ['Are you sure?', 'Are you sure?', 'Are you sure?', 'Really sure?', 'Really, truly, absolutely sure?'],
    yue: ['你肯定？', '你肯定？', '你肯定？', '真係肯定？', '真真正正、十足十肯定？'],
  },
  'dialog.confirm': {
    en: ['Confirm', 'Confirm', 'Yes, do it', 'Yes, do it', 'Yes. Do it.'],
    yue: ['確認', '確認', '好，做啦', '好，做啦', '好。做。'],
  },
  'dialog.destructive.note': {
    en: ['This cannot be undone.', 'This cannot be undone.', 'There is no undo for this.', 'There is no undo for this one.', 'There is no undo, no backup and no going back.'],
    yue: ['呢個冇得 undo。', '呢個冇得 undo。', '呢個真係冇得 undo。', '呢個真係冇得 undo 㗎。', '冇得 undo、冇備份、冇轉頭路。'],
  },
  'dialog.escapeHint': {
    en: ['Press {keys} to cancel.', 'Press {keys} to cancel.', 'Press {keys} to back out.', 'Press {keys} if you have changed your mind.', 'Press {keys} if you have thought better of it.'],
    yue: ['撳 {keys} 取消。', '撳 {keys} 取消。', '撳 {keys} 就走得。', '改變主意就撳 {keys}。', '諗過覺得唔妥，就撳 {keys}。'],
  },

  // =========================================================================
  // tab titles
  // =========================================================================

  'tab.farm': {
    en: ['Farm', 'Farm', 'The farm', 'The farm', 'The farm, and everything on it'],
    yue: ['農場', '農場', '塊田', '塊田', '塊田，同埋田上面所有嘢'],
  },
  'tab.settings': {
    en: ['Settings', 'Settings', 'Settings', 'Settings', 'Settings'],
    yue: ['設定', '設定', '設定', '設定', '設定'],
  },
  'tab.almanac': {
    en: ['Almanac', 'Almanac', 'Almanac', 'The almanac', 'The almanac, keeper of every number'],
    yue: ['農民曆', '農民曆', '農民曆', '本農民曆', '本農民曆，records 晒所有數字'],
  },
  'tab.changelog': {
    en: ['Changelog', 'Changelog', 'Changelog', 'The changelog', 'The changelog, honest to a fault'],
    yue: ['更新紀錄', '更新紀錄', '更新紀錄', '本更新紀錄', '本更新紀錄，老實到有啲蠢'],
  },
  'tab.history': {
    en: ['History', 'History', 'History', 'Your history', 'Your history, every last entry of it'],
    yue: ['歷史', '歷史', '歷史紀錄', '你嘅歷史紀錄', '你嘅歷史紀錄，一筆都冇漏'],
  },
  'tab.surprise': {
    en: ['Surprise', 'Surprise', 'Surprise', 'A surprise', 'A surprise, drawn by hand'],
    yue: ['驚喜', '驚喜', '驚喜', '一個驚喜', '一個驚喜，一筆一筆畫出嚟'],
  },

  // =========================================================================
  // almanac
  // =========================================================================

  'almanac.title': {
    en: ['Almanac', 'Almanac', 'The almanac', 'The almanac', 'The almanac — everything worth knowing'],
    yue: ['農民曆', '農民曆', '本農民曆', '本農民曆', '本農民曆——值得知嘅嘢全部喺度'],
  },
  'almanac.intro': {
    en: [
      'Everything about the farm, kept offline.',
      'Everything about the farm, kept offline.',
      'Everything worth knowing about the farm, kept offline and read straight from the game.',
      'Everything worth knowing about the farm, kept offline and read straight from the game itself.',
      'Everything worth knowing about the farm, kept offline and read straight from the game itself — not one number retyped by hand.',
    ],
    yue: [
      '關於塊田嘅所有嘢，全部離線。',
      '關於塊田嘅所有嘢，全部離線。',
      '關於塊田值得知嘅嘢，全部離線，數字直接由遊戲度攞。',
      '關於塊田值得知嘅嘢，全部離線，數字直接由遊戲本身度攞。',
      '關於塊田值得知嘅嘢，全部離線，數字直接由遊戲度攞——冇一個係人手抄返嚟。',
    ],
  },
  'almanac.section.howto': {
    en: ['How to play', 'How to play', 'How to play', 'How to play', 'How to play, in six honest steps'],
    yue: ['點玩', '點玩', '點玩', '點玩', '點玩，六個老實步驟'],
  },
  'almanac.section.crops': {
    en: ['Crops', 'Crops', 'Every crop', 'Every crop in the valley', 'Every crop in the valley, with its real numbers'],
    yue: ['農作物', '農作物', '所有農作物', '山谷入面所有農作物', '山谷入面所有農作物，附真數字'],
  },
  'almanac.section.tools': {
    en: ['Tools', 'Tools', 'Your tools', 'The seven things you can hold', 'The seven things you can hold, and what each one does'],
    yue: ['工具', '工具', '你嘅工具', '你揸得住嘅七樣嘢', '你揸得住嘅七樣嘢，同埋佢哋做咩'],
  },
  'almanac.section.controls': {
    en: ['Controls', 'Controls', 'Controls', 'Every control', 'Every control, keyboard first'],
    yue: ['操作', '操作', '操作', '所有操作', '所有操作，鍵盤優先'],
  },
  'almanac.section.seasons': {
    en: ['Seasons', 'Seasons', 'The four seasons', 'The four seasons', 'The four seasons, and what each one asks of you'],
    yue: ['季節', '季節', '四季', '四季', '四季，同埋每一季想你做啲乜'],
  },
  'almanac.section.weather': {
    en: ['Weather', 'Weather', 'Weather', 'The weather', 'The weather, and what it does to your soil'],
    yue: ['天氣', '天氣', '天氣', '天氣', '天氣，同埋佢對你塊泥做咗啲乜'],
  },
  'almanac.section.quality': {
    en: ['Quality', 'Quality', 'Produce quality', 'Produce quality', 'Produce quality, and how to earn the good stuff'],
    yue: ['品質', '品質', '收成品質', '收成品質', '收成品質，同埋點樣先種到好嘢'],
  },
  'almanac.section.energy': {
    en: ['Energy and time', 'Energy and time', 'Energy and time', 'Energy and time', 'Energy and time, the only two things you can run out of'],
    yue: ['體力同時間', '體力同時間', '體力同時間', '體力同時間', '體力同時間——得呢兩樣嘢會用完'],
  },
  'almanac.section.money': {
    en: ['Money', 'Money', 'Money', 'Money', 'Money, and where it comes from'],
    yue: ['錢', '錢', '錢', '錢', '錢，同埋佢哋由邊度嚟'],
  },
  'almanac.section.accessibility': {
    en: ['Accessibility', 'Accessibility', 'Accessibility', 'Accessibility', 'Accessibility, and how seriously we take it'],
    yue: ['無障礙', '無障礙', '無障礙', '無障礙', '無障礙，同埋我哋有幾認真'],
  },
  'almanac.howto.1': {
    en: [
      'Clear the debris with the axe.',
      'Clear the debris with the axe.',
      'Start by clearing the weeds, rocks and logs with the axe.',
      'Start by clearing the weeds, rocks and logs. That is what the axe is for.',
      'Start by clearing the weeds, rocks and logs. The axe has been waiting years for this.',
    ],
    yue: [
      '用斧頭清走雜物。',
      '用斧頭清走雜物。',
      '先用斧頭清走啲草、石同木頭。',
      '先清走啲草、石同木頭，把斧頭就係做呢樣嘢。',
      '先清走啲草、石同木頭。把斧頭等咗好多年就係等呢一日。',
    ],
  },
  'almanac.howto.2': {
    en: ['Till the ground with the hoe.', 'Till the ground with the hoe.', 'Turn the ground over with the hoe.', 'Turn the ground over with the hoe until it is dark and open.', 'Turn the ground over with the hoe until it is dark, open and breathing.'],
    yue: ['用鋤頭翻泥。', '用鋤頭翻泥。', '用鋤頭將塊地翻鬆。', '用鋤頭翻到塊地又黑又鬆為止。', '用鋤頭翻到塊地又黑又鬆，鬆到識呼吸為止。'],
  },
  'almanac.howto.3': {
    en: ['Sow a seed that suits the season.', 'Sow a seed that suits the season.', 'Sow a seed that likes this season.', 'Sow a seed that actually likes this season.', 'Sow a seed that actually likes this season, or watch it sulk and die.'],
    yue: ['落啲啱季節嘅種。', '落啲啱季節嘅種。', '落啲鍾意呢個季節嘅種。', '落啲真係鍾意呢個季節嘅種。', '落啲真係鍾意呢個季節嘅種，唔係佢就會嬲到死畀你睇。'],
  },
  'almanac.howto.4': {
    en: ['Water it every day.', 'Water it every day.', 'Water it every single day.', 'Water it every single day. Plants keep score.', 'Water it every single day. Plants keep score, and they hold grudges.'],
    yue: ['日日淋水。', '日日淋水。', '日日都要淋水。', '日日都要淋水，啲植物記住晒㗎。', '日日都要淋水。啲植物記住晒，仲要好記仇。'],
  },
  'almanac.howto.5': {
    en: ['Sleep to end the day.', 'Sleep to end the day.', 'Sleep to end the day and let things grow.', 'Sleep to end the day. Everything grows while you are out cold.', 'Sleep to end the day. The whole valley gets on with growing while you lie there snoring.'],
    yue: ['瞓覺去結束一日。', '瞓覺去結束一日。', '瞓覺結束一日，啲嘢就會生。', '瞓覺結束一日。你瞓死咗嗰陣，啲嘢就喺度生。', '瞓覺結束一日。你喺度瞓到扯晒鼻鼾，成個山谷就喺度努力咁生。'],
  },
  'almanac.howto.6': {
    en: ['Harvest, then sell at the shop.', 'Harvest, then sell at the shop.', 'Harvest what is ripe, then sell it at the shop.', 'Harvest what is ripe and sell it at the shop, and do it all again.', 'Harvest what is ripe, sell it at the shop, and begin the whole beautiful cycle again.'],
    yue: ['收成，然後去舖頭賣。', '收成，然後去舖頭賣。', '熟咗就收，然後去舖頭賣。', '熟咗就收，攞去舖頭賣，然後由頭再嚟過。', '熟咗就收，攞去舖頭賣，然後又由頭開始呢個美麗嘅循環。'],
  },
  'almanac.crops.column.name': {
    en: ['Crop', 'Crop', 'Crop', 'Crop', 'Crop'],
    yue: ['作物', '作物', '作物', '作物', '作物'],
  },
  'almanac.crops.column.season': {
    en: ['Season', 'Season', 'Season', 'Season', 'Season'],
    yue: ['季節', '季節', '季節', '季節', '季節'],
  },
  'almanac.crops.column.seed': {
    en: ['Seed cost', 'Seed cost', 'Seed cost', 'What the seed costs', 'What the seed costs you'],
    yue: ['種子價', '種子價', '種子價', '粒種幾錢', '粒種要你幾多錢'],
  },
  'almanac.crops.column.sell': {
    en: ['Sells for', 'Sells for', 'Sells for', 'What it sells for', 'What it sells for, at normal quality'],
    yue: ['賣價', '賣價', '賣幾錢', '賣得幾錢', '普通品質賣得幾錢'],
  },
  'almanac.crops.column.grow': {
    en: ['Growing days', 'Growing days', 'Days to grow', 'Days of watering to grow', 'Days of watering before it is ready'],
    yue: ['生長日數', '生長日數', '要幾多日', '要淋幾多日水', '要淋幾多日水先熟'],
  },
  'almanac.crops.column.regrow': {
    en: ['Regrows', 'Regrows', 'Regrows in', 'Regrows in', 'Regrows in, if it regrows at all'],
    yue: ['再生', '再生', '幾耐再生', '幾耐再生', '幾耐再生，如果佢識再生嘅話'],
  },
  'almanac.crops.column.yield': {
    en: ['Yield', 'Yield', 'Yield', 'How many you get', 'How many you get per picking'],
    yue: ['收成量', '收成量', '收成量', '收到幾多', '每次收到幾多'],
  },
  'almanac.crops.value.gold': {
    en: ['{gold}g', '{gold}g', '{gold}g', '{gold}g', '{gold}g'],
    yue: ['{gold}g', '{gold}g', '{gold}g', '{gold}g', '{gold}g'],
  },
  'almanac.crops.value.days': {
    en: ['{days} days', '{days} days', '{days} days', '{days} days', '{days} days'],
    yue: ['{days} 日', '{days} 日', '{days} 日', '{days} 日', '{days} 日'],
  },
  'almanac.crops.value.yield': {
    en: ['{min} to {max}', '{min} to {max}', '{min} to {max}', '{min} to {max}', '{min} to {max}'],
    yue: ['{min} 至 {max}', '{min} 至 {max}', '{min} 至 {max}', '{min} 至 {max}', '{min} 至 {max}'],
  },
  'almanac.crops.value.once': {
    en: ['Once only', 'Once only', 'One picking only', 'One picking and it is finished', 'One picking and it retires forever'],
    yue: ['得一造', '得一造', '淨係收得一次', '收完一次就完', '收完一次就永久退休'],
  },
  'almanac.controls.column.input': {
    en: ['Key', 'Key', 'Key', 'Key', 'Key'],
    yue: ['按鍵', '按鍵', '按鍵', '按鍵', '按鍵'],
  },
  'almanac.controls.column.action': {
    en: ['What it does', 'What it does', 'What it does', 'What it does', 'What it does, exactly'],
    yue: ['做咩', '做咩', '做咩用', '佢做咩', '佢究竟做咩'],
  },
  'control.move': {
    en: ['Walk, and face that way', 'Walk, and face that way', 'Walk, and turn to face that way', 'Walk that way, and turn to face it', 'Walk that way, and turn to face it, even when the step is blocked'],
    yue: ['行路，同埋轉向嗰邊', '行路，同埋轉向嗰邊', '行路，順便轉向嗰邊', '向嗰邊行，順便轉埋身', '向嗰邊行，順便轉埋身，就算行唔到都會轉'],
  },
  'control.use': {
    en: ['Use the held tool on the faced tile', 'Use the held tool on the faced tile', 'Use whatever you are holding on the tile in front', 'Use whatever you are holding on the tile in front of you', 'Use whatever you are holding on the tile you are staring at'],
    yue: ['對住嗰格用手上嘅工具', '對住嗰格用手上嘅工具', '用你揸住嗰樣嘢整前面嗰格', '用你揸住嗰樣嘢整前面嗰格', '用你揸住嗰樣嘢，整你死盯住嗰格'],
  },
  'control.tool': {
    en: ['Pick a tool', 'Pick a tool', 'Pick a tool', 'Pick a tool from the belt', 'Pick a tool straight off the belt'],
    yue: ['揀工具', '揀工具', '揀工具', '喺腰帶度揀工具', '直接喺腰帶度抽件工具出嚟'],
  },
  'control.seed': {
    en: ['Cycle the selected seed', 'Cycle the selected seed', 'Cycle through your seeds', 'Cycle through the seeds in your bag', 'Cycle through every seed rattling in your bag'],
    yue: ['切換揀緊嘅種子', '切換揀緊嘅種子', '喺你啲種子度轉', '喺袋入面啲種子度轉', '喺個袋入面啲叮噹響嘅種子度逐粒轉'],
  },
  'control.shop': {
    en: ['Open the shop', 'Open the shop', 'Open the shop', 'Open the shop', 'Open the shop and spend recklessly'],
    yue: ['開舖頭', '開舖頭', '開舖頭', '入舖頭', '入舖頭，亂咁使錢'],
  },
  'control.bag': {
    en: ['Open the bag', 'Open the bag', 'Open your bag', 'Open your bag', 'Open your bag and take stock'],
    yue: ['開背囊', '開背囊', '開你個袋', '開你個袋', '開你個袋，點下貨'],
  },
  'control.sleep': {
    en: ['Sleep until morning', 'Sleep until morning', 'Sleep until morning', 'Sleep until morning', 'Sleep until morning, and let the valley get on with it'],
    yue: ['瞓到天光', '瞓到天光', '瞓到天光', '瞓到天光', '瞓到天光，畀個山谷自己搞掂佢'],
  },
  'control.help': {
    en: ['Open help', 'Open help', 'Open the help', 'Open the help', 'Open the help, there is no shame in it'],
    yue: ['開說明', '開說明', '開說明', '開說明', '開說明，唔使覺得羞家'],
  },
  'control.mute': {
    en: ['Mute or unmute', 'Mute or unmute', 'Mute or unmute', 'Silence it, or bring it back', 'Silence it, or bring the whole valley back'],
    yue: ['靜音／出返聲', '靜音／出返聲', '靜音／出返聲', '收聲，或者出返聲', '收聲，或者叫返成個山谷出嚟'],
  },
  'control.close': {
    en: ['Close the top panel', 'Close the top panel', 'Close the panel on top', 'Close whatever panel is on top', 'Close whatever panel is sitting on top'],
    yue: ['閂最上面嗰個面板', '閂最上面嗰個面板', '閂最上面嗰個板', '閂最上面嗰塊板', '閂最上面壓住嗰塊板'],
  },
  'almanac.accessibility.keyboard': {
    en: [
      'Every action is reachable from the keyboard. The mouse is optional.',
      'Every action is reachable from the keyboard. The mouse is optional.',
      'Every action is reachable from the keyboard — the mouse is entirely optional.',
      'Every action is reachable from the keyboard. The mouse is entirely optional, and always was.',
      'Every action is reachable from the keyboard. The mouse is entirely optional, and always was. Unplug it if you like.',
    ],
    yue: [
      '所有動作用鍵盤都做到，滑鼠可有可無。',
      '所有動作用鍵盤都做到，滑鼠可有可無。',
      '所有動作用鍵盤都做到——滑鼠完全可有可無。',
      '所有動作用鍵盤都做到。滑鼠完全可有可無，一直都係。',
      '所有動作用鍵盤都做到。滑鼠完全可有可無，一直都係。鍾意嘅話拔咗佢都得。',
    ],
  },
  'almanac.accessibility.reader': {
    en: [
      'State changes are mirrored into a live region for screen readers.',
      'State changes are mirrored into a live region for screen readers.',
      'Anything that changes is mirrored into a live region so a screen reader hears it.',
      'Anything that changes is mirrored into a live region so a screen reader hears it too.',
      'Anything that changes is mirrored into a live region, so a screen reader hears every last thing.',
    ],
    yue: [
      '狀態變化會鏡射入 live region 畀讀屏軟件用。',
      '狀態變化會鏡射入 live region 畀讀屏軟件用。',
      '任何變化都會鏡射入 live region，讀屏軟件聽得到。',
      '任何變化都會鏡射入 live region，讀屏軟件都聽得到。',
      '任何變化都會鏡射入 live region，讀屏軟件連最後一件事都聽得到。',
    ],
  },
  'almanac.accessibility.focus': {
    en: [
      'The cursor tile carries a pulsing outline. Position is never colour alone.',
      'The cursor tile carries a pulsing outline. Position is never shown by colour alone.',
      'The cursor tile carries a pulsing outline, so position is never shown by colour alone.',
      'The cursor tile wears a pulsing outline, so position is never shown by colour alone.',
      'The cursor tile wears a pulsing outline at all times, because position is never, ever shown by colour alone.',
    ],
    yue: [
      '游標格有跳動嘅外框，位置唔會淨靠顏色表達。',
      '游標格有跳動嘅外框，位置唔會淨靠顏色表達。',
      '游標格有個跳動嘅外框，所以位置唔會淨靠顏色。',
      '游標格戴住個跳動嘅外框，位置唔會淨靠顏色。',
      '游標格成日戴住個跳動嘅外框，因為位置死都唔會淨靠顏色。',
    ],
  },
  'almanac.accessibility.contrast': {
    en: [
      'Text never sits on a background within {ratio} to 1 of it.',
      'Text never sits on a background within {ratio} to 1 of it.',
      'Text never sits on a background within {ratio} to 1 of its own colour.',
      'Text never sits on a background within {ratio} to 1 of its own colour. We checked every pair.',
      'Text never sits on a background within {ratio} to 1 of its own colour. We checked every single pair.',
    ],
    yue: [
      '文字唔會擺喺對比度細過 {ratio} 比 1 嘅背景上。',
      '文字唔會擺喺對比度細過 {ratio} 比 1 嘅背景上。',
      '文字唔會擺喺對比度細過 {ratio} 比 1 嘅背景上面。',
      '文字唔會擺喺對比度細過 {ratio} 比 1 嘅背景上面，每一對我哋都核對過。',
      '文字唔會擺喺對比度細過 {ratio} 比 1 嘅背景上面。每一對都核對過，一對都冇漏。',
    ],
  },
  'almanac.accessibility.motion': {
    en: [
      'The app honours reduced motion, in the game and in the shell.',
      'The app honours reduced motion, in the game and in the shell.',
      'Reduced motion is honoured everywhere — in the game and in the shell around it.',
      'Reduced motion is honoured everywhere, in the game and in the shell around it.',
      'Reduced motion is honoured everywhere, in the game and in the shell around it, without one sulky exception.',
    ],
    yue: [
      '個 app 會遵守減少動態，遊戲同外殼都係。',
      '個 app 會遵守減少動態，遊戲同外殼都係。',
      '減少動態喺邊度都會遵守——遊戲同外面個殼都係。',
      '減少動態喺邊度都遵守，遊戲同外面個殼都一樣。',
      '減少動態喺邊度都遵守，遊戲同外面個殼都一樣，冇一個扭計例外。',
    ],
  },
  'search.almanac.label': {
    en: ['Search the almanac', 'Search the almanac', 'Search the almanac', 'Hunt through the almanac', 'Interrogate every page of the almanac'],
    yue: ['搜尋農民曆', '搜尋農民曆', '喺農民曆度搵嘢', '喺農民曆度掘下', '本農民曆每一版都揭一次'],
  },
  'search.almanac.placeholder': {
    en: ['Search the almanac', 'Search the almanac', 'Search the almanac', 'What do you want to know?', 'Ask it anything about the valley'],
    yue: ['搜尋農民曆', '搜尋農民曆', '搵農民曆', '你想知咩？', '關於個山谷，問乜都得'],
  },
  'search.crops.label': {
    en: ['Search crops', 'Search crops', 'Search every crop', 'Hunt through every crop', 'Interrogate all of the crops at once'],
    yue: ['搜尋農作物', '搜尋農作物', '搵所有農作物', '喺所有農作物度掘下', '所有農作物一次過查晒'],
  },
  'search.crops.placeholder': {
    en: ['Search crops', 'Search crops', 'Search crops', 'Which crop?', 'Which crop are you after?'],
    yue: ['搜尋農作物', '搜尋農作物', '搵農作物', '要邊種作物？', '你想搵邊種作物？'],
  },

  // =========================================================================
  // changelog
  // =========================================================================

  'changelog.title': {
    en: ['Changelog', 'Changelog', 'Changelog', 'The changelog', 'The changelog, in full'],
    yue: ['更新紀錄', '更新紀錄', '更新紀錄', '本更新紀錄', '本更新紀錄，全文奉上'],
  },
  'changelog.intro': {
    en: [
      'Bundled at build time. Nothing is fetched.',
      'Bundled at build time. Nothing is fetched.',
      'Bundled into the app at build time — nothing is fetched from anywhere.',
      'Bundled into the app at build time. Nothing is fetched from anywhere, ever.',
      'Bundled into the app at build time. Nothing is fetched from anywhere, ever, not even a comma.',
    ],
    yue: [
      '打包喺 build 入面，唔會上網攞。',
      '打包喺 build 入面，唔會上網攞。',
      'Build 嗰陣已經打包入去——完全唔會去邊度攞。',
      'Build 嗰陣已經打包入去。永遠唔會去任何地方攞嘢。',
      'Build 嗰陣已經打包入去。永遠唔會去攞嘢，連個逗號都唔會上網攞。',
    ],
  },
  'changelog.version': {
    en: ['Version {version}', 'Version {version}', 'Version {version}', 'Version {version}', 'Version {version}, for the record'],
    yue: ['版本 {version}', '版本 {version}', '版本 {version}', '版本 {version}', '版本 {version}，載入史冊'],
  },
  'changelog.released': {
    en: ['Released {date}', 'Released {date}', 'Released on {date}', 'Released on {date}', 'Released on {date}, to great acclaim'],
    yue: ['{date} 發佈', '{date} 發佈', '{date} 發佈', '喺 {date} 發佈', '喺 {date} 隆重發佈，好評如潮'],
  },
  'changelog.empty': {
    en: ['The changelog is empty.', 'The changelog is empty.', 'There is nothing in the changelog yet.', 'The changelog has nothing to say yet.', 'The changelog has nothing to say. Give it time.'],
    yue: ['更新紀錄係空嘅。', '更新紀錄係空嘅。', '更新紀錄仲未有嘢。', '更新紀錄暫時冇嘢好講。', '更新紀錄暫時冇嘢好講。畀啲時間佢啦。'],
  },
  'search.changelog.label': {
    en: ['Search the changelog', 'Search the changelog', 'Search the changelog', 'Hunt through the changelog', 'Interrogate every line of the changelog'],
    yue: ['搜尋更新紀錄', '搜尋更新紀錄', '喺更新紀錄度搵嘢', '喺更新紀錄度掘下', '更新紀錄每一行都查一次'],
  },
  'search.changelog.placeholder': {
    en: ['Search the changelog', 'Search the changelog', 'Search the changelog', 'What changed?', 'What exactly changed, and when?'],
    yue: ['搜尋更新紀錄', '搜尋更新紀錄', '搵更新紀錄', '改咗啲咩？', '究竟改咗啲咩，幾時改？'],
  },

  // =========================================================================
  // history
  // =========================================================================

  'history.title': {
    en: ['History', 'History', 'History', 'Your history', 'Your history, kept honestly'],
    yue: ['歷史紀錄', '歷史紀錄', '歷史紀錄', '你嘅歷史紀錄', '你嘅歷史紀錄，老老實實記住'],
  },
  'history.desc': {
    en: [
      'Local only, and bounded to {max} entries.',
      'Local only, and bounded to {max} entries.',
      'Kept on this computer only, and bounded to {max} entries.',
      'Kept on this computer only, bounded to {max} entries, oldest first out.',
      'Kept on this computer only, bounded to {max} entries, and the oldest is quietly shown the door.',
    ],
    yue: [
      '淨係本機，最多 {max} 條。',
      '淨係本機，最多 {max} 條。',
      '淨係存喺呢部機，最多 {max} 條。',
      '淨係存喺呢部機，最多 {max} 條，最舊嗰條先走。',
      '淨係存喺呢部機，最多 {max} 條，最舊嗰條會靜靜雞被請走。',
    ],
  },
  'history.empty': {
    en: ['Nothing has happened yet.', 'Nothing has happened yet.', 'Nothing has happened yet.', 'Nothing has happened yet. Go and do something.', 'Nothing has happened yet. Go on, do something worth recording.'],
    yue: ['暫時乜都未發生。', '暫時乜都未發生。', '暫時乜都未發生過。', '暫時乜都未發生，去做啲嘢啦。', '暫時乜都未發生。去做啲值得記低嘅嘢啦。'],
  },
  'history.count': {
    en: ['{count} of {total} entries', '{count} of {total} entries', '{count} of {total} entries', '{count} of {total} entries shown', '{count} of {total} entries, carefully selected'],
    yue: ['{total} 條入面嘅 {count} 條', '{total} 條入面嘅 {count} 條', '{total} 條入面嘅 {count} 條', '顯示 {total} 條入面嘅 {count} 條', '{total} 條入面精挑細選咗 {count} 條'],
  },
  'history.at': {
    en: ['{time}', '{time}', '{time}', '{time}', '{time}'],
    yue: ['{time}', '{time}', '{time}', '{time}', '{time}'],
  },
  'history.kind.action': {
    en: ['Farm action', 'Farm action', 'Farm action', 'Something you did on the farm', 'Something you did out on the farm'],
    yue: ['農場動作', '農場動作', '農場動作', '你喺塊田度做過嘅嘢', '你喺塊田度做過嘅嘢'],
  },
  'history.kind.purchase': {
    en: ['Purchase', 'Purchase', 'Purchase', 'Money going out', 'Money leaving your purse'],
    yue: ['購買', '購買', '買嘢', '洗錢', '啲錢離開你個荷包'],
  },
  'history.kind.sale': {
    en: ['Sale', 'Sale', 'Sale', 'Money coming in', 'Money arriving in your purse'],
    yue: ['出售', '出售', '賣嘢', '入錢', '啲錢返入你個荷包'],
  },
  'history.kind.day': {
    en: ['Day', 'Day', 'A day passing', 'A day passing', 'Another day gone by'],
    yue: ['日子', '日子', '過咗一日', '過咗一日', '又過咗一日'],
  },
  'history.kind.setting': {
    en: ['Setting', 'Setting', 'Setting changed', 'A setting you changed', 'A setting you changed, for better or worse'],
    yue: ['設定', '設定', '改咗設定', '你改咗個設定', '你改咗個設定，好定唔好就唔知'],
  },
  'history.kind.navigation': {
    en: ['Navigation', 'Navigation', 'Moving about', 'Moving about the app', 'Wandering about the app'],
    yue: ['導覽', '導覽', '周圍行', '喺 app 度周圍行', '喺 app 度周圍遊蕩'],
  },
  'history.kind.export': {
    en: ['Export', 'Export', 'Export', 'Data taken out', 'Data packed up and taken out'],
    yue: ['匯出', '匯出', '匯出', '攞咗啲資料出去', '打包咗啲資料攞出去'],
  },
  'history.kind.error': {
    en: ['Error', 'Error', 'Something went wrong', 'Something went wrong', 'Something went badly wrong'],
    yue: ['錯誤', '錯誤', '出咗事', '出咗事', '出咗大鑊事'],
  },
  'history.clear': {
    en: ['Clear the history', 'Clear the history', 'Clear the history', 'Wipe the history', 'Wipe the history and forget it all'],
    yue: ['清除歷史', '清除歷史', '清走歷史紀錄', '抹走歷史紀錄', '抹走歷史紀錄，當乜都冇發生過'],
  },
  'history.clear.confirm.title': {
    en: ['Clear the history?', 'Clear the history?', 'Clear the history?', 'Really wipe the history?', 'Truly wipe every trace of the past?'],
    yue: ['清除歷史？', '清除歷史？', '清走歷史紀錄？', '真係抹走歷史紀錄？', '真係要抹走過去嘅所有痕跡？'],
  },
  'history.clear.confirm.body': {
    en: ['{count} entries will be deleted.', '{count} entries will be deleted.', '{count} entries will be deleted.', '{count} entries go in the bin.', '{count} entries go in the bin, never to be seen again.'],
    yue: ['會刪咗 {count} 條紀錄。', '會刪咗 {count} 條紀錄。', '會刪咗 {count} 條紀錄。', '{count} 條紀錄掉落垃圾桶。', '{count} 條紀錄掉落垃圾桶，永不超生。'],
  },
  'history.cleared': {
    en: ['Cleared {count} entries.', 'Cleared {count} entries.', 'Cleared {count} entries.', '{count} entries, gone.', '{count} entries, gone without a trace.'],
    yue: ['清咗 {count} 條紀錄。', '清咗 {count} 條紀錄。', '清咗 {count} 條紀錄。', '{count} 條紀錄，冇晒。', '{count} 條紀錄，一絲痕跡都冇留低。'],
  },
  'history.filter.kind': {
    en: ['Filter by kind', 'Filter by kind', 'Filter by kind', 'Show one kind only', 'Show one kind only, and hide the rest'],
    yue: ['按類型篩選', '按類型篩選', '按類型篩選', '淨係睇一種', '淨係睇一種，其他收埋'],
  },
  'history.filter.all': {
    en: ['All kinds', 'All kinds', 'Every kind', 'Every kind at once', 'Every kind at once, no filtering'],
    yue: ['所有類型', '所有類型', '所有類型', '全部類型一齊睇', '全部類型一齊睇，唔篩'],
  },
  'search.history.label': {
    en: ['Search the history', 'Search the history', 'Search your history', 'Hunt through your history', 'Interrogate every entry in your history'],
    yue: ['搜尋歷史紀錄', '搜尋歷史紀錄', '喺你嘅歷史度搵嘢', '喺你嘅歷史度掘下', '你每一條歷史紀錄都查一次'],
  },
  'search.history.placeholder': {
    en: ['Search history', 'Search history', 'Search history', 'What are you looking for?', 'What are you trying to remember?'],
    yue: ['搜尋歷史', '搜尋歷史', '搵歷史', '你搵緊咩？', '你想記返起啲咩？'],
  },

  // =========================================================================
  // export and import
  // =========================================================================

  'export.title': {
    en: ['Export', 'Export', 'Export', 'Export your data', 'Export your data, all of it'],
    yue: ['匯出', '匯出', '匯出', '匯出你啲資料', '匯出你啲資料，全部'],
  },
  'export.format.json': {
    en: ['JSON', 'JSON', 'JSON', 'JSON, for machines', 'JSON, for machines and the curious'],
    yue: ['JSON', 'JSON', 'JSON', 'JSON，畀機器睇', 'JSON，畀機器同好奇嘅人睇'],
  },
  'export.format.csv': {
    en: ['CSV', 'CSV', 'CSV', 'CSV, for spreadsheets', 'CSV, for spreadsheets and long evenings'],
    yue: ['CSV', 'CSV', 'CSV', 'CSV，畀試算表用', 'CSV，畀試算表同啲長夜用'],
  },
  'export.format.markdown': {
    en: ['Markdown', 'Markdown', 'Markdown', 'Markdown, for reading', 'Markdown, for actual human reading'],
    yue: ['Markdown', 'Markdown', 'Markdown', 'Markdown，睇得舒服', 'Markdown，畀真人類睇嗰隻'],
  },
  'export.target.save': {
    en: ['The farm save', 'The farm save', 'The farm save', 'The farm save', 'The farm save, the whole valley in one file'],
    yue: ['農場存檔', '農場存檔', '農場存檔', '農場存檔', '農場存檔，成個山谷一個檔案'],
  },
  'export.target.settings': {
    en: ['Settings', 'Settings', 'Your settings', 'Your settings', 'Your settings, every last toggle'],
    yue: ['設定', '設定', '你嘅設定', '你嘅設定', '你嘅設定，連最後一個掣都包'],
  },
  'export.target.appearance': {
    en: ['Appearance', 'Appearance', 'Your appearance changes', 'Your appearance changes', 'Your appearance changes, every restyled pixel'],
    yue: ['外觀', '外觀', '你嘅外觀改動', '你嘅外觀改動', '你嘅外觀改動，每粒改過嘅 pixel'],
  },
  'export.target.history': {
    en: ['History', 'History', 'Your history', 'Your history', 'Your history, warts and all'],
    yue: ['歷史', '歷史', '你嘅歷史', '你嘅歷史', '你嘅歷史，連衰嘢都包埋'],
  },
  'export.target.all': {
    en: ['Everything', 'Everything', 'Everything', 'The whole lot', 'The whole lot, in one honest file'],
    yue: ['全部', '全部', '全部', '成籠嘢', '成籠嘢，一個老實檔案入面'],
  },
  'export.download': {
    en: ['Download', 'Download', 'Download it', 'Save it to a file', 'Save it to a file and keep it safe'],
    yue: ['下載', '下載', '下載佢', '存做檔案', '存做檔案，收好佢'],
  },
  'export.copy': {
    en: ['Copy to the clipboard', 'Copy to the clipboard', 'Copy it to the clipboard', 'Copy the whole thing', 'Copy the whole thing to your clipboard'],
    yue: ['複製到剪貼簿', '複製到剪貼簿', 'Copy 落剪貼簿', '成份 copy 低', '成份 copy 落你個剪貼簿'],
  },
  'export.size': {
    en: ['{bytes} bytes', '{bytes} bytes', '{bytes} bytes', '{bytes} bytes', '{bytes} bytes, not one more'],
    yue: ['{bytes} bytes', '{bytes} bytes', '{bytes} bytes', '{bytes} bytes', '{bytes} bytes，多一個都冇'],
  },
  'export.done': {
    en: ['Saved {filename}.', 'Saved {filename}.', 'Saved {filename}.', 'Saved as {filename}. Look after it.', 'Saved as {filename}. Guard it with your life.'],
    yue: ['已儲存 {filename}。', '已儲存 {filename}。', '存咗做 {filename}。', '存咗做 {filename}，好好保管。', '存咗做 {filename}，用生命保護佢。'],
  },
  'export.failed': {
    en: ['Export failed: {error}', 'Export failed: {error}', 'The export did not work: {error}', 'The export fell over: {error}', 'The export fell over in spectacular fashion: {error}'],
    yue: ['匯出失敗：{error}', '匯出失敗：{error}', '匯出唔成功：{error}', '匯出仆咗街：{error}', '匯出轟轟烈烈咁仆咗街：{error}'],
  },
  'export.empty': {
    en: ['There is nothing to export.', 'There is nothing to export.', 'There is nothing here to export.', 'There is nothing here worth exporting.', 'There is nothing here worth exporting. Come back later.'],
    yue: ['冇嘢可以匯出。', '冇嘢可以匯出。', '呢度冇嘢可以匯出。', '呢度冇乜嘢值得匯出。', '呢度冇乜嘢值得匯出。遲啲再嚟啦。'],
  },
  'import.title': {
    en: ['Import', 'Import', 'Import', 'Import data', 'Import data from a file you trust'],
    yue: ['匯入', '匯入', '匯入', '匯入資料', '由一個你信得過嘅檔案匯入資料'],
  },
  'import.paste': {
    en: ['Paste the exported text', 'Paste the exported text', 'Paste the exported text here', 'Paste what you exported earlier', 'Paste what you exported earlier, in full'],
    yue: ['貼上匯出咗嘅文字', '貼上匯出咗嘅文字', '喺呢度貼返匯出嘅文字', '貼返你之前匯出嗰啲', '貼返你之前匯出嗰啲，要全份'],
  },
  'import.confirm.title': {
    en: ['Import and replace?', 'Import and replace?', 'Import and replace what is here?', 'Import this and replace what is here?', 'Import this and replace everything currently here?'],
    yue: ['匯入並取代？', '匯入並取代？', '匯入，然後取代而家啲嘢？', '匯入呢份，取代而家啲嘢？', '匯入呢份，取代晒而家所有嘢？'],
  },
  'import.confirm.body': {
    en: ['{count} records will be replaced.', '{count} records will be replaced.', '{count} records will be replaced.', '{count} records get overwritten.', '{count} records get overwritten and there is no undo.'],
    yue: ['會取代 {count} 筆記錄。', '會取代 {count} 筆記錄。', '會取代 {count} 筆記錄。', '{count} 筆記錄會被覆蓋。', '{count} 筆記錄會被覆蓋，而且冇得 undo。'],
  },
  'import.done': {
    en: ['Imported {count} records.', 'Imported {count} records.', 'Imported {count} records.', '{count} records are in.', '{count} records have arrived safely.'],
    yue: ['匯入咗 {count} 筆記錄。', '匯入咗 {count} 筆記錄。', '匯入咗 {count} 筆記錄。', '{count} 筆記錄入咗嚟。', '{count} 筆記錄平安抵達。'],
  },
  'import.invalid': {
    en: ['That file cannot be read: {error}', 'That file cannot be read: {error}', 'That file cannot be read: {error}', 'That file makes no sense: {error}', 'That file makes no sense whatsoever: {error}'],
    yue: ['讀唔到個檔案：{error}', '讀唔到個檔案：{error}', '個檔案讀唔到：{error}', '個檔案完全睇唔明：{error}', '個檔案亂到完全睇唔明：{error}'],
  },

  // =========================================================================
  // the dim sum surprise
  // =========================================================================

  'surprise.title': {
    en: ['A small surprise', 'A small surprise', 'A small surprise', 'A small surprise', 'A small surprise, drawn by hand'],
    yue: ['一個小驚喜', '一個小驚喜', '一個小驚喜', '一個小驚喜', '一個小驚喜，一筆一筆畫出嚟'],
  },
  'surprise.enable': {
    en: ['Show the surprise', 'Show the surprise', 'Show me the surprise', 'Go on, show me', 'Go on then, show me the surprise'],
    yue: ['顯示驚喜', '顯示驚喜', '畀個驚喜我睇', '嚟啦，畀我睇下', '嚟啦，畀個驚喜我睇下'],
  },
  'surprise.disable': {
    en: ['Hide the surprise', 'Hide the surprise', 'Put the surprise away', 'Put the surprise away', 'Put the surprise away, for now'],
    yue: ['隱藏驚喜', '隱藏驚喜', '收埋個驚喜', '收埋個驚喜', '暫時收埋個驚喜先'],
  },
  'surprise.desc': {
    en: [
      'Every piece here is drawn as pixels. No photographs, and no network request.',
      'Every piece here is drawn as pixels. No photographs, and no network request.',
      'Every piece here is drawn as pixels — no photographs, and not one network request.',
      'Every piece here is drawn as pixels. No photographs, no downloads, not one network request.',
      'Every piece here is drawn as pixels, by hand. No photographs, no downloads, not one network request, not ever.',
    ],
    yue: [
      '呢度每一件都係用 pixel 畫出嚟。冇相，亦都唔會上網。',
      '呢度每一件都係用 pixel 畫出嚟。冇相，亦都唔會上網。',
      '呢度每一件都係用 pixel 畫出嚟——冇相，一個網絡請求都冇。',
      '呢度每一件都係用 pixel 畫出嚟。冇相、冇下載、一個網絡請求都冇。',
      '呢度每一件都係人手一粒粒 pixel 畫出嚟。冇相、冇下載、一個網絡請求都冇，永遠都冇。',
    ],
  },
  'surprise.item.hargow': {
    en: ['Har gow', 'Har gow', 'Har gow', 'Har gow, four pleats and proud of it', 'Har gow, pleated four times because anything less is an insult'],
    yue: ['蝦餃', '蝦餃', '蝦餃', '蝦餃，摺足四褶，好威', '蝦餃，摺足四褶，少一褶都係侮辱'],
  },
  'surprise.item.siumai': {
    en: ['Siu mai', 'Siu mai', 'Siu mai', 'Siu mai, topped and open', 'Siu mai, standing open-topped and utterly unbothered'],
    yue: ['燒賣', '燒賣', '燒賣', '燒賣，open top 咁企喺度', '燒賣，open top 咁企喺度，完全唔怕醜'],
  },
  'surprise.item.charsiubao': {
    en: ['Char siu bao', 'Char siu bao', 'Char siu bao', 'Char siu bao, split at the top', 'Char siu bao, split at the top and steaming quietly'],
    yue: ['叉燒包', '叉燒包', '叉燒包', '叉燒包，笑口爆晒開', '叉燒包，笑口爆晒開，靜靜哋噴住煙'],
  },
  'surprise.item.cheungfun': {
    en: ['Cheung fun', 'Cheung fun', 'Cheung fun', 'Cheung fun, rolled and glossy', 'Cheung fun, rolled, glossy and swimming in sweet soy'],
    yue: ['腸粉', '腸粉', '腸粉', '腸粉，捲得靚靚哋仲油潤', '腸粉，捲得靚靚哋，油潤到浸喺甜豉油度游水'],
  },
  'surprise.item.eggtart': {
    en: ['Egg tart', 'Egg tart', 'Egg tart', 'Egg tart, still warm', 'Egg tart, still warm, and worth burning your mouth for'],
    yue: ['蛋撻', '蛋撻', '蛋撻', '蛋撻，仲熱辣辣', '蛋撻，仲熱辣辣，燙親條脷都抵'],
  },

  // =========================================================================
  // names — these ARE facts, so they read identically at every level
  // =========================================================================

  'crop.parsnip': {
    en: ['Parsnip', 'Parsnip', 'Parsnip', 'Parsnip', 'Parsnip'],
    yue: ['防風草', '防風草', '防風草', '防風草', '防風草'],
  },
  'crop.tulip': {
    en: ['Tulip', 'Tulip', 'Tulip', 'Tulip', 'Tulip'],
    yue: ['鬱金香', '鬱金香', '鬱金香', '鬱金香', '鬱金香'],
  },
  'crop.cabbage': {
    en: ['Cabbage', 'Cabbage', 'Cabbage', 'Cabbage', 'Cabbage'],
    yue: ['椰菜', '椰菜', '椰菜', '椰菜', '椰菜'],
  },
  'crop.strawberry': {
    en: ['Strawberry', 'Strawberry', 'Strawberry', 'Strawberry', 'Strawberry'],
    yue: ['士多啤梨', '士多啤梨', '士多啤梨', '士多啤梨', '士多啤梨'],
  },
  'crop.pepper': {
    en: ['Pepper', 'Pepper', 'Pepper', 'Pepper', 'Pepper'],
    yue: ['燈籠椒', '燈籠椒', '燈籠椒', '燈籠椒', '燈籠椒'],
  },
  'crop.tomato': {
    en: ['Tomato', 'Tomato', 'Tomato', 'Tomato', 'Tomato'],
    yue: ['番茄', '番茄', '番茄', '番茄', '番茄'],
  },
  'crop.corn': {
    en: ['Corn', 'Corn', 'Corn', 'Corn', 'Corn'],
    yue: ['粟米', '粟米', '粟米', '粟米', '粟米'],
  },
  'crop.melon': {
    en: ['Melon', 'Melon', 'Melon', 'Melon', 'Melon'],
    yue: ['蜜瓜', '蜜瓜', '蜜瓜', '蜜瓜', '蜜瓜'],
  },
  'crop.barley': {
    en: ['Barley', 'Barley', 'Barley', 'Barley', 'Barley'],
    yue: ['大麥', '大麥', '大麥', '大麥', '大麥'],
  },
  'crop.beet': {
    en: ['Beet', 'Beet', 'Beet', 'Beet', 'Beet'],
    yue: ['甜菜根', '甜菜根', '甜菜根', '甜菜根', '甜菜根'],
  },
  'crop.grape': {
    en: ['Grape', 'Grape', 'Grape', 'Grape', 'Grape'],
    yue: ['提子', '提子', '提子', '提子', '提子'],
  },
  'crop.pumpkin': {
    en: ['Pumpkin', 'Pumpkin', 'Pumpkin', 'Pumpkin', 'Pumpkin'],
    yue: ['南瓜', '南瓜', '南瓜', '南瓜', '南瓜'],
  },
  'crop.snowdrop': {
    en: ['Snowdrop', 'Snowdrop', 'Snowdrop', 'Snowdrop', 'Snowdrop'],
    yue: ['雪花蓮', '雪花蓮', '雪花蓮', '雪花蓮', '雪花蓮'],
  },
  'crop.winterroot': {
    en: ['Winterroot', 'Winterroot', 'Winterroot', 'Winterroot', 'Winterroot'],
    yue: ['冬根', '冬根', '冬根', '冬根', '冬根'],
  },
  'crop.frostcap': {
    en: ['Frostcap', 'Frostcap', 'Frostcap', 'Frostcap', 'Frostcap'],
    yue: ['霜菇', '霜菇', '霜菇', '霜菇', '霜菇'],
  },
  'crop.unknown': {
    en: ['Unknown crop', 'Unknown crop', 'Unknown crop', 'Unknown crop', 'Unknown crop'],
    yue: ['不明作物', '不明作物', '不明作物', '不明作物', '不明作物'],
  },
  'season.spring': {
    en: ['Spring', 'Spring', 'Spring', 'Spring', 'Spring'],
    yue: ['春天', '春天', '春天', '春天', '春天'],
  },
  'season.summer': {
    en: ['Summer', 'Summer', 'Summer', 'Summer', 'Summer'],
    yue: ['夏天', '夏天', '夏天', '夏天', '夏天'],
  },
  'season.fall': {
    en: ['Fall', 'Fall', 'Fall', 'Fall', 'Fall'],
    yue: ['秋天', '秋天', '秋天', '秋天', '秋天'],
  },
  'season.winter': {
    en: ['Winter', 'Winter', 'Winter', 'Winter', 'Winter'],
    yue: ['冬天', '冬天', '冬天', '冬天', '冬天'],
  },
  'weather.clear': {
    en: ['Clear', 'Clear', 'Clear', 'Clear', 'Clear'],
    yue: ['晴天', '晴天', '晴天', '晴天', '晴天'],
  },
  'weather.rain': {
    en: ['Rain', 'Rain', 'Rain', 'Rain', 'Rain'],
    yue: ['落雨', '落雨', '落雨', '落雨', '落雨'],
  },
  'weather.storm': {
    en: ['Storm', 'Storm', 'Storm', 'Storm', 'Storm'],
    yue: ['暴風雨', '暴風雨', '暴風雨', '暴風雨', '暴風雨'],
  },
  'weather.snow': {
    en: ['Snow', 'Snow', 'Snow', 'Snow', 'Snow'],
    yue: ['落雪', '落雪', '落雪', '落雪', '落雪'],
  },
  'quality.normal': {
    en: ['Normal', 'Normal', 'Normal', 'Normal', 'Normal'],
    yue: ['普通', '普通', '普通', '普通', '普通'],
  },
  'quality.silver': {
    en: ['Silver', 'Silver', 'Silver', 'Silver', 'Silver'],
    yue: ['銀級', '銀級', '銀級', '銀級', '銀級'],
  },
  'quality.gold': {
    en: ['Gold', 'Gold', 'Gold', 'Gold', 'Gold'],
    yue: ['金級', '金級', '金級', '金級', '金級'],
  },
  'tool.hoe': {
    en: ['Hoe', 'Hoe', 'Hoe', 'Hoe', 'Hoe'],
    yue: ['鋤頭', '鋤頭', '鋤頭', '鋤頭', '鋤頭'],
  },
  'tool.can': {
    en: ['Watering can', 'Watering can', 'Watering can', 'Watering can', 'Watering can'],
    yue: ['花灑', '花灑', '花灑', '花灑', '花灑'],
  },
  'tool.seeds': {
    en: ['Seeds', 'Seeds', 'Seeds', 'Seeds', 'Seeds'],
    yue: ['種子', '種子', '種子', '種子', '種子'],
  },
  'tool.hand': {
    en: ['Hand', 'Hand', 'Hand', 'Hand', 'Hand'],
    yue: ['手', '手', '手', '手', '手'],
  },
  'tool.axe': {
    en: ['Axe', 'Axe', 'Axe', 'Axe', 'Axe'],
    yue: ['斧頭', '斧頭', '斧頭', '斧頭', '斧頭'],
  },
  'tool.sprinkler': {
    en: ['Sprinkler', 'Sprinkler', 'Sprinkler', 'Sprinkler', 'Sprinkler'],
    yue: ['灑水器', '灑水器', '灑水器', '灑水器', '灑水器'],
  },
  'tool.fertilizer': {
    en: ['Fertilizer', 'Fertilizer', 'Fertilizer', 'Fertilizer', 'Fertilizer'],
    yue: ['肥料', '肥料', '肥料', '肥料', '肥料'],
  },
  'tool.hoe.desc': {
    en: ['Turns grass into soil.', 'Turns grass into soil.', 'Turns plain grass into workable soil.', 'Turns plain grass into soil worth sowing.', 'Turns idle grass into dark, open, sowable soil.'],
    yue: ['將草地變泥地。', '將草地變泥地。', '將普通草地變成可以耕嘅泥地。', '將普通草地變成值得落種嘅泥地。', '將懶懶閒嘅草地，變成又黑又鬆、落到種嘅好泥。'],
  },
  'tool.can.desc': {
    en: ['Waters tilled soil.', 'Waters tilled soil.', 'Waters tilled soil, as far as it reaches.', 'Waters tilled soil, as far as its reach goes.', 'Waters every tilled tile it can reach, and looks good doing it.'],
    yue: ['淋濕翻鬆咗嘅泥。', '淋濕翻鬆咗嘅泥。', '淋濕翻鬆咗嘅泥，射得幾遠得幾遠。', '淋濕翻鬆咗嘅泥，射程去到邊淋到邊。', '射程之內每一格翻鬆嘅泥都淋到，仲要淋得好有型。'],
  },
  'tool.seeds.desc': {
    en: ['Sows the selected seed.', 'Sows the selected seed.', 'Sows whichever seed you have selected.', 'Sows whichever seed you have picked out.', 'Sows whichever seed you have picked out, and hopes for the best.'],
    yue: ['落你揀咗嗰種種子。', '落你揀咗嗰種種子。', '落你揀咗嗰種種子落地。', '你揀邊種就落邊種。', '你揀邊種就落邊種，然後求神拜佛。'],
  },
  'tool.hand.desc': {
    en: ['Picks ripe crops.', 'Picks ripe crops.', 'Picks anything that is ripe.', 'Picks anything ripe, and pulls up anything dead.', 'Picks anything ripe, and hauls up anything that gave up and died.'],
    yue: ['摘熟咗嘅作物。', '摘熟咗嘅作物。', '熟咗嘅就摘。', '熟咗就摘，死咗就拔。', '熟咗就摘，放棄咗死咗嗰啲就拔佢上嚟。'],
  },
  'tool.axe.desc': {
    en: ['Clears weeds, rocks and logs.', 'Clears weeds, rocks and logs.', 'Clears weeds, rocks and logs off the ground.', 'Clears weeds, rocks and logs, at a price in energy.', 'Clears weeds, rocks and logs — and charges your back for the privilege.'],
    yue: ['清走雜草、石頭同木頭。', '清走雜草、石頭同木頭。', '將雜草、石頭同木頭清走。', '清走雜草、石頭同木頭，代價係體力。', '清走雜草、石頭同木頭——代價由你條腰找數。'],
  },
  'tool.sprinkler.desc': {
    en: ['Waters its neighbours each night.', 'Waters its neighbours each night.', 'Waters the tiles around it every night.', 'Waters the tiles around it every night, while you sleep.', 'Waters the tiles around it every night while you snore, asking nothing in return.'],
    yue: ['每晚淋隔籬啲格。', '每晚淋隔籬啲格。', '每晚淋濕佢隔籬啲格。', '每晚你瞓覺嗰陣淋濕隔籬啲格。', '你扯鼻鼾嗰陣，佢每晚默默淋濕隔籬啲格，乜都唔要。'],
  },
  'tool.fertilizer.desc': {
    en: ['Enriches tilled soil before sowing.', 'Enriches tilled soil before sowing.', 'Enriches tilled soil, before anything is sown in it.', 'Enriches tilled soil before you sow — faster growth, better quality.', 'Enriches tilled soil before you sow: faster growth, better quality, smugger farmer.'],
    yue: ['落種前令泥更肥。', '落種前令泥更肥。', '落種之前，令翻鬆咗嘅泥更加肥。', '落種前落，生得快啲，品質好啲。', '落種前落：生得快、品質靚，農夫都威幾錢重。'],
  },
  'good.sprinkler': {
    en: ['Sprinkler', 'Sprinkler', 'Sprinkler', 'Sprinkler', 'Sprinkler'],
    yue: ['灑水器', '灑水器', '灑水器', '灑水器', '灑水器'],
  },
  'good.fertilizer': {
    en: ['Fertilizer', 'Fertilizer', 'Fertilizer', 'Fertilizer', 'Fertilizer'],
    yue: ['肥料', '肥料', '肥料', '肥料', '肥料'],
  },
  'ground.grass': {
    en: ['Grass', 'Grass', 'Grass', 'Grass', 'Grass'],
    yue: ['草地', '草地', '草地', '草地', '草地'],
  },
  'ground.soil': {
    en: ['Tilled soil', 'Tilled soil', 'Tilled soil', 'Tilled soil', 'Tilled soil'],
    yue: ['翻好嘅泥', '翻好嘅泥', '翻好嘅泥', '翻好嘅泥', '翻好嘅泥'],
  },
  'ground.weeds': {
    en: ['Weeds', 'Weeds', 'Weeds', 'Weeds', 'Weeds'],
    yue: ['雜草', '雜草', '雜草', '雜草', '雜草'],
  },
  'ground.rock': {
    en: ['Rock', 'Rock', 'Rock', 'Rock', 'Rock'],
    yue: ['石頭', '石頭', '石頭', '石頭', '石頭'],
  },
  'ground.log': {
    en: ['Log', 'Log', 'Log', 'Log', 'Log'],
    yue: ['木頭', '木頭', '木頭', '木頭', '木頭'],
  },
  'ground.water': {
    en: ['Pond', 'Pond', 'Pond', 'Pond', 'Pond'],
    yue: ['池塘', '池塘', '池塘', '池塘', '池塘'],
  },
  'ground.path': {
    en: ['Path', 'Path', 'Path', 'Path', 'Path'],
    yue: ['小路', '小路', '小路', '小路', '小路'],
  },
  'item.seed': {
    en: ['{crop} seeds', '{crop} seeds', '{crop} seeds', '{crop} seeds', '{crop} seeds'],
    yue: ['{crop} 種子', '{crop} 種子', '{crop} 種子', '{crop} 種子', '{crop} 種子'],
  },
  'item.produce': {
    en: ['{crop}', '{crop}', '{crop}', '{crop}', '{crop}'],
    yue: ['{crop}', '{crop}', '{crop}', '{crop}', '{crop}'],
  },
  'item.produce.quality': {
    en: ['{quality} {crop}', '{quality} {crop}', '{quality} {crop}', '{quality} {crop}', '{quality} {crop}'],
    yue: ['{quality} {crop}', '{quality} {crop}', '{quality} {crop}', '{quality} {crop}', '{quality} {crop}'],
  },
  'label.gold': {
    en: ['{gold}g', '{gold}g', '{gold}g', '{gold}g', '{gold}g'],
    yue: ['{gold}g', '{gold}g', '{gold}g', '{gold}g', '{gold}g'],
  },
  'label.energy': {
    en: ['Energy {energy} of {max}', 'Energy {energy} of {max}', 'Energy {energy} of {max}', 'Energy {energy} of {max}', 'Energy {energy} of {max}'],
    yue: ['體力 {energy}／{max}', '體力 {energy}／{max}', '體力 {energy}／{max}', '體力 {energy}／{max}', '體力 {energy}／{max}'],
  },
  'label.date': {
    en: ['{season} {day}, year {year}', '{season} {day}, year {year}', '{season} {day}, year {year}', '{season} {day}, year {year}', '{season} {day}, year {year}'],
    yue: ['{season}第 {day} 日，第 {year} 年', '{season}第 {day} 日，第 {year} 年', '{season}第 {day} 日，第 {year} 年', '{season}第 {day} 日，第 {year} 年', '{season}第 {day} 日，第 {year} 年'],
  },
  'label.time': {
    en: ['{time}', '{time}', '{time}', '{time}', '{time}'],
    yue: ['{time}', '{time}', '{time}', '{time}', '{time}'],
  },
  'label.count': {
    en: ['{count} × {item}', '{count} × {item}', '{count} × {item}', '{count} × {item}', '{count} × {item}'],
    yue: ['{count} × {item}', '{count} × {item}', '{count} × {item}', '{count} × {item}', '{count} × {item}'],
  },

  // =========================================================================
  // game messages — every message src/game/actions.ts returns
  // =========================================================================

  'game.guard.exhausted': {
    en: [
      'You cannot act. Go to bed.',
      'You can barely stand. Go to bed.',
      'You can barely stand. Get yourself to bed.',
      'You can barely stand up. Bed. Now.',
      'You are swaying like a scarecrow in a gale. Bed. Immediately.',
    ],
    yue: [
      '你做唔到嘢，去瞓覺。',
      '你企都企唔穩，去瞓啦。',
      '你企都企唔穩喇，快啲去瞓。',
      '你企都企唔穩，仲唔上床？',
      '你搖到好似打風嗰陣個稻草人咁，即刻上床，唔好嘈。',
    ],
  },
  'game.guard.offMap': {
    en: [
      'There is nothing there.',
      'There is nothing over there.',
      'There is nothing over there.',
      'There is nothing over there at all.',
      'There is nothing over there. Not a thing. You are gesturing at the void.',
    ],
    yue: [
      '嗰度冇嘢。',
      '嗰邊乜都冇。',
      '嗰邊乜都冇喎。',
      '嗰邊真係乜都冇。',
      '嗰邊乜都冇。一啲都冇。你而家喺度指住個虛空。',
    ],
  },
  'game.guard.tired': {
    en: [
      'You do not have the energy.',
      'You are too tired for that.',
      'You are too tired for that.',
      'You are far too tired for that.',
      'You are far too tired for that, and your arms have filed a complaint.',
    ],
    yue: [
      '你冇夠體力。',
      '你太攰做唔到。',
      '你太攰喇，做唔到。',
      '你攰到冇能力做呢樣嘢。',
      '你攰到冇能力做呢樣嘢，你雙手仲寫咗封投訴信。',
    ],
  },
  'game.debris.weeds': {
    en: ['weeds', 'weeds', 'weeds', 'weeds', 'weeds'],
    yue: ['雜草', '雜草', '雜草', '雜草', '雜草'],
  },
  'game.debris.rock': {
    en: ['rock', 'rock', 'rock', 'rock', 'rock'],
    yue: ['石頭', '石頭', '石頭', '石頭', '石頭'],
  },
  'game.debris.log': {
    en: ['log', 'log', 'log', 'log', 'log'],
    yue: ['木頭', '木頭', '木頭', '木頭', '木頭'],
  },
  'game.debris.other': {
    en: ['debris', 'debris', 'debris', 'debris', 'debris'],
    yue: ['雜物', '雜物', '雜物', '雜物', '雜物'],
  },
  'game.clear.first': {
    en: [
      'Clear the {debris} first.',
      'Clear the {debris} first.',
      'Clear the {debris} out of the way first.',
      'Clear the {debris} first — it is in the way.',
      'Clear the {debris} first. It is standing there like it pays rent.',
    ],
    yue: [
      '先清走啲{debris}。',
      '先清走啲{debris}。',
      '先清走啲{debris}先得。',
      '先清走啲{debris}啦，佢阻住晒。',
      '先清走啲{debris}。佢企喺度，仲當自己交緊租咁。',
    ],
  },
  'game.clear.nothing': {
    en: [
      'There is nothing to clear there.',
      'There is nothing to clear there.',
      'There is nothing to clear there.',
      'There is nothing there to clear.',
      'There is nothing there to clear. You are swinging at fresh air.',
    ],
    yue: [
      '嗰度冇嘢好清。',
      '嗰度冇嘢好清。',
      '嗰度冇嘢好清喎。',
      '嗰度根本冇嘢好清。',
      '嗰度根本冇嘢好清。你而家斬緊空氣。',
    ],
  },
  'game.clear.weeds': {
    en: [
      'The weeds are cleared.',
      'The weeds come up easily.',
      'The weeds come up easily.',
      'The weeds come up without a fight.',
      'The weeds come up without a fight, which is frankly disappointing.',
    ],
    yue: [
      '啲雜草清走咗。',
      '啲雜草好易就拔到起。',
      '啲雜草好易就拔到起。',
      '啲雜草一拔就起，完全冇反抗。',
      '啲雜草一拔就起，完全冇反抗，講真都幾失望。',
    ],
  },
  'game.clear.rock': {
    en: [
      'The rock is broken up.',
      'The rock breaks apart.',
      'The rock breaks apart.',
      'The rock gives up and breaks apart.',
      'The rock holds out for one proud second, then breaks apart.',
    ],
    yue: [
      '嚿石打散咗。',
      '嚿石裂開咗。',
      '嚿石裂開咗。',
      '嚿石頂唔住，裂開咗。',
      '嚿石好威咁頂咗一秒，然後裂開咗。',
    ],
  },
  'game.clear.log': {
    en: [
      'The log is split and hauled off.',
      'The log splits and is hauled off.',
      'The log splits and is hauled off.',
      'The log splits with a crack and is hauled off.',
      'The log splits with a crack that echoes down the valley, then is hauled off.',
    ],
    yue: [
      '碌木劈開咗，拖走咗。',
      '碌木劈開咗，拖咗走。',
      '碌木一劈就開，拖咗走。',
      '碌木「啪」一聲劈開，拖咗走。',
      '碌木「啪」一聲劈開，聲響傳遍成個山谷，然後拖咗走。',
    ],
  },
  'game.till.already': {
    en: ['This soil is already turned.', 'This soil is already turned.', 'This soil is already turned over.', 'This soil is already turned. Twice is not better.', 'This soil is already turned. Turning it twice impresses nobody.'],
    yue: ['呢忽泥已經翻咗。', '呢忽泥已經翻咗。', '呢忽泥翻咗喇。', '呢忽泥翻咗喇，翻兩次唔會好啲。', '呢忽泥翻咗喇。翻兩次唔會有人讚你。'],
  },
  'game.till.pond': {
    en: ['You cannot till the pond.', 'You cannot till the pond.', 'You cannot till the pond.', 'You cannot till a pond, no matter how you feel about it.', 'You cannot till a pond. Water has been refusing hoes since the dawn of time.'],
    yue: ['你唔可以翻個池塘。', '你唔可以翻個池塘。', '個池塘翻唔到㗎。', '個池塘點都翻唔到，唔好諗喇。', '個池塘翻唔到。水由開天闢地嗰日已經唔畀鋤頭埋身。'],
  },
  'game.till.path': {
    en: ['The path is packed too hard.', 'The path is packed too hard.', 'The path is packed far too hard.', 'The path is packed far too hard for that.', 'The path is packed harder than your resolve. It wins.'],
    yue: ['條路夯得太實。', '條路夯得太實。', '條路實到唔郁得。', '條路實到你點鋤都冇用。', '條路實過你個決心。你輸。'],
  },
  'game.till.ok': {
    en: [
      'The soil is turned.',
      'The earth turns over.',
      'The earth turns over, dark and ready.',
      'The earth rolls over, dark and ready for a seed.',
      'The earth rolls over and shows its dark belly, ready and waiting for a seed.',
    ],
    yue: [
      '泥翻好咗。',
      '泥土翻咗過嚟。',
      '泥土翻鬆晒，又黑又靚，準備好。',
      '泥土翻鬆晒，又黑又靚，等緊粒種。',
      '大地為你翻個身，露出黑漆漆嘅肚腩，靜靜等一粒種落嚟。',
    ],
  },
  'game.water.noSoil': {
    en: ['There is no tilled soil to water.', 'There is no tilled soil to water.', 'There is no tilled soil here to water.', 'There is no tilled soil here to water at all.', 'There is no tilled soil here. You are watering the concept of gardening.'],
    yue: ['冇翻好嘅泥可以淋。', '冇翻好嘅泥可以淋。', '呢度冇翻好嘅泥淋。', '呢度根本冇翻好嘅泥可以淋。', '呢度冇翻好嘅泥。你而家淋緊「耕田」呢個概念。'],
  },
  'game.water.already': {
    en: ['This soil is already watered.', 'This soil is already watered.', 'This soil is already watered.', 'This soil is already watered. It is quite full.', 'This soil is already watered. It is full, thank you, and slightly embarrassed.'],
    yue: ['呢忽泥已經淋咗。', '呢忽泥已經淋咗。', '呢忽泥淋咗喇。', '呢忽泥淋咗喇，飽到滯。', '呢忽泥淋咗喇，飽到滯，仲有啲唔好意思。'],
  },
  'game.water.ok': {
    en: ['The soil is watered.', 'The soil drinks it up.', 'The soil drinks it up.', 'The soil drinks it up greedily.', 'The soil drinks it up like it has been waiting all week for that.'],
    yue: ['泥淋咗水。', '啲泥飲晒啲水。', '啲泥一啖就飲晒。', '啲泥貪心咁一啖飲晒。', '啲泥一啖飲晒，好似等咗成個星期就等呢啖。'],
  },
  'game.water.many': {
    en: ['Watered {count} tiles.', 'Watered {count} tiles.', 'Watered {count} tiles in one go.', 'Watered {count} tiles in one sweep. Efficient.', 'Watered {count} tiles in a single glorious sweep. The can is thrilled.'],
    yue: ['淋咗 {count} 格。', '淋咗 {count} 格。', '一嘢淋咗 {count} 格。', '一 sweep 淋咗 {count} 格，夠晒效率。', '一 sweep 淋咗 {count} 格，把花灑興奮到震。'],
  },
  'game.sow.noSuchSeed': {
    en: ['You have no such seed.', 'You have no such seed.', 'You have no such seed.', 'You have no such seed on you.', 'You have no such seed. You checked twice. It is not there.'],
    yue: ['你冇呢種種子。', '你冇呢種種子。', '你冇呢種種子喎。', '你身上冇呢種種子。', '你冇呢種種子。你搵咗兩次。真係冇。'],
  },
  'game.sow.tillFirst': {
    en: ['Till the ground first.', 'Till the ground first.', 'Till the ground first.', 'Till the ground first — seeds are fussy.', 'Till the ground first. Seeds are fussy and they will not settle for grass.'],
    yue: ['先翻泥。', '先翻泥先。', '要先翻泥先得。', '先翻泥啦，啲種子好揀擇㗎。', '先翻泥啦。啲種子好揀擇，草地佢哋唔會就。'],
  },
  'game.sow.badGround': {
    en: ['Seeds will not take there.', 'Seeds will not take there.', 'Seeds will not take there.', 'Seeds will not take there, however you plant them.', 'Seeds will not take there, and no amount of encouragement will change that.'],
    yue: ['種子喺嗰度種唔到。', '種子喺嗰度種唔到。', '嗰度啲種子唔會生。', '嗰度點種都唔會生。', '嗰度點種都唔會生，你點鼓勵佢都冇用。'],
  },
  'game.sow.occupied': {
    en: ['Something is already growing here.', 'Something is already growing here.', 'Something is already growing here.', 'Something is already growing here, thank you.', 'Something is already growing here and it was here first.'],
    yue: ['呢度已經有嘢生緊。', '呢度已經有嘢生緊。', '呢度有嘢生緊喇。', '呢度有嘢生緊，唔該。', '呢度有嘢生緊，而且人哋早過你到。'],
  },
  'game.sow.noSeeds': {
    en: ['No {crop} seeds in the bag.', 'No {crop} seeds in the bag.', 'No {crop} seeds in the bag.', 'Not one {crop} seed in the bag.', 'Not one {crop} seed in the bag. The bag is quite sure.'],
    yue: ['袋入面冇 {crop} 種子。', '袋入面冇 {crop} 種子。', '個袋度冇 {crop} 種子喎。', '個袋度一粒 {crop} 種子都冇。', '個袋度一粒 {crop} 種子都冇。個袋好肯定。'],
  },
  'game.sow.outOfSeason': {
    en: [
      '{crop} will not grow in {season}.',
      '{crop} will not grow in {season}.',
      '{crop} will not grow in {season}.',
      '{crop} refuses to grow in {season}.',
      '{crop} flatly refuses to grow in {season}, and it will not be argued with.',
    ],
    yue: [
      '{crop} 喺{season}唔生。',
      '{crop} 喺{season}唔會生。',
      '{crop} 喺{season}唔會生㗎。',
      '{crop} 喺{season}打死都唔生。',
      '{crop} 喺{season}打死都唔生，同佢講數都冇用。',
    ],
  },
  'game.sow.ok': {
    en: ['{crop} sown.', '{crop} sown.', '{crop} is in the ground.', '{crop} is in the ground. Now leave it alone.', '{crop} is in the ground and already plotting its future.'],
    yue: ['落咗 {crop}。', '落咗 {crop}。', '{crop} 落咗地喇。', '{crop} 落咗地，而家唔好搞佢。', '{crop} 落咗地，仲已經喺度規劃緊人生。'],
  },
  'game.harvest.useAxe': {
    en: ['Use the axe on the {debris}.', 'Use the axe on the {debris}.', 'Use the axe on the {debris}.', 'That is a job for the axe — the {debris} is in the way.', 'Hands are no use here. The {debris} wants the axe, and it wants it now.'],
    yue: ['用斧頭搞掂啲{debris}。', '用斧頭搞掂啲{debris}。', '啲{debris}要用斧頭。', '呢樣要斧頭做，啲{debris}阻住晒。', '用手係冇用嘅。啲{debris}要斧頭，而且即刻要。'],
  },
  'game.harvest.nothing': {
    en: ['There is nothing to pick here.', 'There is nothing to pick here.', 'There is nothing to pick here.', 'There is nothing here worth picking.', 'There is nothing here to pick. Your hand closes on air.'],
    yue: ['呢度冇嘢好摘。', '呢度冇嘢好摘。', '呢度冇嘢好摘喎。', '呢度冇嘢值得摘。', '呢度冇嘢好摘。你隻手揸咗一撮空氣。'],
  },
  'game.harvest.notReady': {
    en: ['The {crop} is not ready yet.', 'The {crop} is not ready yet.', 'The {crop} is not ready yet.', 'The {crop} is not ready yet. Patience.', 'The {crop} is not ready yet, and staring at it will not help.'],
    yue: ['{crop} 仲未熟。', '{crop} 仲未熟。', '{crop} 仲未熟喎。', '{crop} 仲未熟，忍下手。', '{crop} 仲未熟，你點眼超超咁望住佢都冇用。'],
  },
  'game.harvest.withered': {
    en: [
      'You pull up the withered {crop}.',
      'You pull up the withered {crop}.',
      'You pull up the withered {crop}.',
      'You pull up the withered {crop}. It happens.',
      'You pull up the withered {crop} and hold a short, dignified funeral.',
    ],
    yue: [
      '你拔起咗棵枯咗嘅 {crop}。',
      '你拔起咗棵枯咗嘅 {crop}。',
      '你拔起咗棵枯咗嘅 {crop}。',
      '你拔起咗棵枯咗嘅 {crop}。人有失手㗎。',
      '你拔起棵枯咗嘅 {crop}，仲幫佢開咗個簡短而莊嚴嘅追思會。',
    ],
  },
  'game.harvest.ok': {
    en: ['Picked {count} {crop}.', 'Picked {count} {crop}.', 'Picked {count} {crop}.', 'Picked {count} {crop}. Not bad at all.', 'Picked {count} {crop}. The bag grows heavy and you grow proud.'],
    yue: ['摘咗 {count} 個 {crop}。', '摘咗 {count} 個 {crop}。', '摘咗 {count} 個 {crop}。', '摘咗 {count} 個 {crop}，唔錯喎。', '摘咗 {count} 個 {crop}。個袋越嚟越重，你個心越嚟越威。'],
  },
  'game.harvest.okQuality': {
    en: [
      'Picked {count} {crop}, {quality} quality.',
      'Picked {count} {crop}, {quality} quality.',
      'Picked {count} {crop} — {quality} quality, no less.',
      'Picked {count} {crop} at {quality} quality. Look at you.',
      'Picked {count} {crop} at {quality} quality. Somewhere, a judge is weeping.',
    ],
    yue: [
      '摘咗 {count} 個 {crop}，{quality} 品質。',
      '摘咗 {count} 個 {crop}，{quality} 品質。',
      '摘咗 {count} 個 {crop}——仲要係 {quality} 品質。',
      '摘咗 {count} 個 {crop}，{quality} 品質。犀利喎你。',
      '摘咗 {count} 個 {crop}，{quality} 品質。唔知邊度有個評判喊到收唔到聲。',
    ],
  },
  'game.harvest.okRegrow': {
    en: [
      'Picked {count} {crop}. It will bear again.',
      'Picked {count} {crop}. It will bear again.',
      'Picked {count} {crop}, and it will bear again.',
      'Picked {count} {crop}, and it is already planning the next batch.',
      'Picked {count} {crop}, and the plant is already planning its next performance.',
    ],
    yue: [
      '摘咗 {count} 個 {crop}，佢會再結果。',
      '摘咗 {count} 個 {crop}，佢會再結果。',
      '摘咗 {count} 個 {crop}，佢仲會再結果。',
      '摘咗 {count} 個 {crop}，佢已經計劃緊下一批。',
      '摘咗 {count} 個 {crop}，棵嘢已經喺度綵排緊下一場。',
    ],
  },
  'game.harvest.okQualityRegrow': {
    en: [
      'Picked {count} {crop}, {quality} quality. It will bear again.',
      'Picked {count} {crop}, {quality} quality. It will bear again.',
      'Picked {count} {crop} at {quality} quality, and it will bear again.',
      'Picked {count} {crop} at {quality} quality, and it is already planning the next batch.',
      'Picked {count} {crop} at {quality} quality, and the plant is already planning an encore.',
    ],
    yue: [
      '摘咗 {count} 個 {crop}，{quality} 品質，佢會再結果。',
      '摘咗 {count} 個 {crop}，{quality} 品質，佢會再結果。',
      '摘咗 {count} 個 {crop}，{quality} 品質，仲會再結果。',
      '摘咗 {count} 個 {crop}，{quality} 品質，佢已經計劃緊下一批。',
      '摘咗 {count} 個 {crop}，{quality} 品質，棵嘢已經準備緊 encore。',
    ],
  },
  'game.sprinkler.none': {
    en: ['No sprinklers in the bag.', 'No sprinklers in the bag.', 'No sprinklers in the bag.', 'Not one sprinkler in the bag.', 'Not one sprinkler in the bag. They are four hundred gold each, after all.'],
    yue: ['袋入面冇灑水器。', '袋入面冇灑水器。', '個袋度冇灑水器喎。', '個袋度一個灑水器都冇。', '個袋度一個灑水器都冇。都係啦，一個四百蚊金。'],
  },
  'game.sprinkler.already': {
    en: ['A sprinkler already stands here.', 'A sprinkler already stands here.', 'A sprinkler already stands here.', 'A sprinkler already stands here, doing its job.', 'A sprinkler already stands here, doing its job, and it does not want a colleague.'],
    yue: ['呢度已經有個灑水器。', '呢度已經有個灑水器。', '呢度企咗個灑水器喇。', '呢度企咗個灑水器，做緊嘢。', '呢度企咗個灑水器做緊嘢，佢唔想有同事。'],
  },
  'game.sprinkler.pond': {
    en: ['It would sink in the pond.', 'It would sink in the pond.', 'It would sink straight into the pond.', 'It would sink straight into the pond, which defeats the purpose.', 'It would sink straight into the pond, where it would water fish. Fish do not need watering.'],
    yue: ['擺落池塘會沉。', '擺落池塘會沉。', '擺落池塘會即刻沉曬。', '擺落池塘會沉，咁即係做乜？', '擺落池塘會沉，然後淋緊啲魚。啲魚唔使人淋。'],
  },
  'game.sprinkler.occupied': {
    en: ['Something is growing there already.', 'Something is growing there already.', 'Something is growing there already.', 'Something is growing there already — find another tile.', 'Something is growing there already. Find it another home.'],
    yue: ['嗰度已經有嘢生緊。', '嗰度已經有嘢生緊。', '嗰度有嘢生緊喇。', '嗰度有嘢生緊，搵第格啦。', '嗰度有嘢生緊。幫佢搵第個屋企啦。'],
  },
  'game.sprinkler.ok': {
    en: [
      'The sprinkler will water its neighbours.',
      'The sprinkler will water its neighbours.',
      'The sprinkler will water its neighbours every night.',
      'The sprinkler will water its neighbours every night while you sleep.',
      'The sprinkler takes its post and will water its neighbours nightly, forever, without complaint.',
    ],
    yue: [
      '個灑水器會淋隔籬啲格。',
      '個灑水器會淋隔籬啲格。',
      '個灑水器每晚都會淋隔籬啲格。',
      '你瞓覺嗰陣，個灑水器每晚都會淋隔籬啲格。',
      '個灑水器就位喇，以後每晚都會默默淋隔籬啲格，永世唔會嘈。',
    ],
  },
  'game.fertilize.none': {
    en: ['No fertilizer in the bag.', 'No fertilizer in the bag.', 'No fertilizer in the bag.', 'Not a scrap of fertilizer in the bag.', 'Not a scrap of fertilizer in the bag. The shop would love to help.'],
    yue: ['袋入面冇肥料。', '袋入面冇肥料。', '個袋度冇肥料喎。', '個袋度一撮肥料都冇。', '個袋度一撮肥料都冇。舖頭好樂意幫你手。'],
  },
  'game.fertilize.needSoil': {
    en: ['Fertilizer only helps tilled soil.', 'Fertilizer only helps tilled soil.', 'Fertilizer only helps tilled soil.', 'Fertilizer only helps tilled soil. Turn it over first.', 'Fertilizer only helps tilled soil. Grass is beyond even its powers.'],
    yue: ['肥料淨係對翻好嘅泥有用。', '肥料淨係對翻好嘅泥有用。', '肥料淨係幫到翻好嘅泥。', '肥料淨係幫到翻好嘅泥，翻咗佢先啦。', '肥料淨係幫到翻好嘅泥。草地連佢都救唔到。'],
  },
  'game.fertilize.beforeSow': {
    en: ['Feed the soil before you sow it.', 'Feed the soil before you sow it.', 'Feed the soil before you sow it.', 'Feed the soil before you sow it, not after.', 'Feed the soil before you sow it. Afterwards is far too late, as usual.'],
    yue: ['落種之前先餵飽塊泥。', '落種之前先餵飽塊泥。', '要落種前先餵塊泥。', '落種前先餵塊泥，唔係之後。', '落種前先餵塊泥。事後先嚟，一如以往，太遲。'],
  },
  'game.fertilize.already': {
    en: ['This soil is already rich.', 'This soil is already rich.', 'This soil is already rich.', 'This soil is already rich enough.', 'This soil is already rich enough to retire on.'],
    yue: ['呢忽泥已經好肥。', '呢忽泥已經好肥。', '呢忽泥夠肥喇。', '呢忽泥已經肥到夠晒。', '呢忽泥肥到可以退休。'],
  },
  'game.fertilize.ok': {
    en: ['The soil is dark and rich.', 'The soil is dark and rich.', 'The soil turns dark and rich.', 'The soil turns dark and rich. Something good will come of this.', 'The soil turns dark and rich as chocolate cake. Great things are coming.'],
    yue: ['塊泥又黑又肥。', '塊泥又黑又肥。', '塊泥變到又黑又肥。', '塊泥變到又黑又肥，實有好嘢出。', '塊泥黑到好似朱古力蛋糕咁肥美。好嘢就嚟嚟喇。'],
  },
  'game.tool.pickSeed': {
    en: [
      'Select a seed first with {keys}.',
      'Pick a seed first with {keys}.',
      'Pick a seed first — press {keys}.',
      'Pick a seed first. That is what {keys} is for.',
      'Pick a seed first. Press {keys}, unless you meant to plant your own optimism.',
    ],
    yue: [
      '先用 {keys} 揀種子。',
      '先用 {keys} 揀粒種。',
      '先揀粒種——撳 {keys}。',
      '先揀粒種，{keys} 就係做呢樣嘢。',
      '先揀粒種，撳 {keys}。除非你想種落去嘅係自己嘅樂觀。',
    ],
  },
  'game.tool.nothing': {
    en: ['Nothing happens.', 'Nothing happens.', 'Nothing happens.', 'Nothing happens at all.', 'Nothing happens. Somewhere, a cricket coughs.'],
    yue: ['乜都冇發生。', '乜都冇發生。', '乜都冇發生喎。', '真係乜都冇發生。', '乜都冇發生。遠處有隻蟋蟀咳咗一聲。'],
  },

  // ---- the sleep report ---------------------------------------------------

  'game.day.title': {
    en: ['{date}', '{date}', '{date}', '{date}', '{date}'],
    yue: ['{date}', '{date}', '{date}', '{date}', '{date}'],
  },
  'game.day.weather': {
    en: ['Overnight: {weather}.', 'Overnight: {weather}.', 'Overnight it was {weather}.', 'Overnight it was {weather}.', 'The night brought {weather}, and the valley took it as it came.'],
    yue: ['尋晚：{weather}。', '尋晚：{weather}。', '尋晚係{weather}。', '尋晚係{weather}。', '尋晚一夜{weather}，個山谷照單全收。'],
  },
  'game.day.forecast': {
    en: ['Tomorrow: {weather}.', 'Tomorrow: {weather}.', 'Tomorrow looks like {weather}.', 'Tomorrow is shaping up to be {weather}.', 'Tomorrow, if the sky is to be believed, will be {weather}.'],
    yue: ['聽日：{weather}。', '聽日：{weather}。', '聽日應該{weather}。', '睇個天，聽日似{weather}。', '如果個天講得過，聽日就係{weather}。'],
  },
  'game.day.watered': {
    en: ['{count} tiles were watered.', '{count} tiles were watered.', '{count} tiles were watered.', '{count} tiles went to bed wet.', '{count} tiles went to bed properly soaked, and slept well.'],
    yue: ['{count} 格有水。', '{count} 格有水。', '{count} 格泥係濕嘅。', '{count} 格濕住入夢。', '{count} 格濕到透，一夜好眠。'],
  },
  'game.day.grew': {
    en: ['{count} plants grew.', '{count} plants grew.', '{count} plants put on some growth.', '{count} plants put on some growth overnight.', '{count} plants stretched, yawned and grew a little in the night.'],
    yue: ['{count} 棵嘢生咗。', '{count} 棵嘢生咗。', '{count} 棵嘢生高咗少少。', '{count} 棵嘢一晚之間生高咗。', '{count} 棵嘢伸個懶腰、打個呵欠，喺夜晚偷偷生高咗。'],
  },
  'game.day.ripened': {
    en: ['{count} are ready to pick.', '{count} are ready to pick.', '{count} are ripe and ready to pick.', '{count} are ripe and waiting for you.', '{count} are ripe, gleaming, and waiting for you to notice.'],
    yue: ['{count} 個熟咗可以摘。', '{count} 個熟咗可以摘。', '{count} 個熟晒，可以摘。', '{count} 個熟晒，等緊你。', '{count} 個熟到發光，等緊你發現佢哋。'],
  },
  'game.day.withered': {
    en: ['{count} withered.', '{count} withered.', '{count} withered from thirst.', '{count} withered from thirst. Water them tomorrow.', '{count} withered from thirst overnight. They died believing in you.'],
    yue: ['{count} 棵枯咗。', '{count} 棵枯咗。', '{count} 棵渴到枯咗。', '{count} 棵渴到枯咗，聽日記得淋水。', '{count} 棵一夜之間渴死。佢哋臨死都仲信你。'],
  },
  'game.day.outOfSeason': {
    en: [
      '{count} crops could not survive the change of season.',
      '{count} crops could not survive the change of season.',
      '{count} crops could not survive the change of season.',
      '{count} crops could not survive the turn of the season and were cleared.',
      '{count} crops could not survive the turn of the season. The calendar shows no mercy.',
    ],
    yue: [
      '{count} 棵作物過唔到轉季。',
      '{count} 棵作物過唔到轉季。',
      '{count} 棵作物捱唔過轉季。',
      '{count} 棵作物捱唔過轉季，清走咗。',
      '{count} 棵作物捱唔過轉季。本日曆從來唔講人情。',
    ],
  },
  'game.day.seasonChanged': {
    en: ['{season} has begun.', '{season} has begun.', '{season} has begun.', '{season} has arrived. Everything changes.', '{season} sweeps into the valley and changes absolutely everything.'],
    yue: ['{season}開始喇。', '{season}開始喇。', '{season}到喇。', '{season}到喇，乜都變晒。', '{season}一嘢殺入山谷，成個世界都變晒樣。'],
  },
  'game.day.passedOut': {
    en: [
      'You passed out and were carried home. {gold}g was taken for the trouble.',
      'You passed out and were carried home. {gold}g was taken for the trouble.',
      'You passed out and someone carried you home. It cost you {gold}g.',
      'You passed out and someone carried you home, then charged you {gold}g for it.',
      'You keeled over in the dirt and were carried home like a sack of parsnips. The bill came to {gold}g.',
    ],
    yue: [
      '你暈咗，畀人抬返屋企，收咗你 {gold}g。',
      '你暈咗，畀人抬返屋企，收咗你 {gold}g。',
      '你暈低咗，有人抬你返屋企，收咗 {gold}g。',
      '你暈低咗，有人抬你返屋企，然後收你 {gold}g。',
      '你一嘢瞓喺泥度，畀人好似抬袋防風草咁抬返屋企。單嘢埋單 {gold}g。',
    ],
  },
  'game.day.quiet': {
    en: ['Nothing much happened.', 'Nothing much happened overnight.', 'A quiet night. Nothing much happened.', 'A quiet night. Nothing much happened at all.', 'A quiet night. Nothing happened, and that is its own kind of blessing.'],
    yue: ['尋晚冇乜嘢發生。', '尋晚冇乜嘢發生。', '一晚好靜，冇乜嘢發生。', '一晚好靜，真係冇乜嘢發生。', '一晚好靜，乜都冇發生——咁其實都算係福氣。'],
  },

  // =========================================================================
  // shop messages — every message src/game/shop.ts returns
  // =========================================================================

  'shop.buy.atLeastOne': {
    en: ['Buy at least one.', 'Buy at least one.', 'Buy at least one.', 'Buy at least one, or buy none at all.', 'Buy at least one. Buying zero of something is a philosophy, not a purchase.'],
    yue: ['最少要買一個。', '最少要買一個。', '最少買一個啦。', '最少買一個，唔係就唔好買。', '最少買一個。買零個唔算購物，只算係一種人生哲學。'],
  },
  'shop.buy.notSold': {
    en: [
      '{item} is not sold this season.',
      '{item} is not sold this season.',
      '{item} is not sold this season.',
      '{item} is not sold this season. Come back later.',
      '{item} is not sold this season. The shopkeeper shrugs at the calendar.',
    ],
    yue: [
      '今季唔賣 {item}。',
      '今季唔賣 {item}。',
      '今季冇 {item} 賣喎。',
      '今季冇 {item} 賣，遲啲再嚟啦。',
      '今季冇 {item} 賣。老闆聳一聳膊頭，指一指本日曆。',
    ],
  },
  'shop.buy.stock': {
    en: ['Only {count} left in stock.', 'Only {count} left in stock.', 'Only {count} left in stock.', 'Only {count} left in stock, sorry.', 'Only {count} left in stock, and the shelf looks rather sad about it.'],
    yue: ['得返 {count} 件貨。', '得返 {count} 件貨。', '存貨得返 {count} 件。', '存貨得返 {count} 件，唔好意思。', '存貨得返 {count} 件，個貨架睇落都幾唏噓。'],
  },
  'shop.buy.cannotAfford': {
    en: [
      'That costs {cost}g and you have {gold}g.',
      'That costs {cost}g and you have {gold}g.',
      'That costs {cost}g, and you have {gold}g.',
      'That costs {cost}g. You have {gold}g. The arithmetic is not kind.',
      'That costs {cost}g. You have {gold}g. The arithmetic is merciless and the shopkeeper is watching.',
    ],
    yue: [
      '要 {cost}g，你有 {gold}g。',
      '要 {cost}g，你有 {gold}g。',
      '要 {cost}g，你得 {gold}g。',
      '要 {cost}g，你得 {gold}g。條數唔係咁友善。',
      '要 {cost}g，你得 {gold}g。條數冷酷無情，老闆仲喺度望住你。',
    ],
  },
  'shop.buy.ok': {
    en: [
      'Bought {count} {item} for {cost}g.',
      'Bought {count} {item} for {cost}g.',
      'Bought {count} {item} for {cost}g.',
      'Bought {count} {item} for {cost}g. Spend it well.',
      'Bought {count} {item} for {cost}g. The coins clink, the shopkeeper beams.',
    ],
    yue: [
      '用 {cost}g 買咗 {count} 件 {item}。',
      '用 {cost}g 買咗 {count} 件 {item}。',
      '用 {cost}g 買咗 {count} 件 {item}。',
      '用 {cost}g 買咗 {count} 件 {item}，好好用啦。',
      '用 {cost}g 買咗 {count} 件 {item}。銀仔叮噹響，老闆笑到見牙唔見眼。',
    ],
  },
  'shop.sell.atLeastOne': {
    en: ['Sell at least one.', 'Sell at least one.', 'Sell at least one.', 'Sell at least one, or sell none at all.', 'Sell at least one. Selling zero is not a transaction, it is a conversation.'],
    yue: ['最少要賣一個。', '最少要賣一個。', '最少賣一個啦。', '最少賣一個，唔係就唔好賣。', '最少賣一個。賣零個唔算交易，只算係傾偈。'],
  },
  'shop.sell.none': {
    en: ['No {item} in the bag.', 'No {item} in the bag.', 'No {item} in the bag.', 'Not one {item} in the bag.', 'Not one {item} in the bag. You may have imagined it.'],
    yue: ['袋入面冇 {item}。', '袋入面冇 {item}。', '個袋度冇 {item} 喎。', '個袋度一件 {item} 都冇。', '個袋度一件 {item} 都冇。可能你發緊夢。'],
  },
  'shop.sell.only': {
    en: ['Only {count} in the bag.', 'Only {count} in the bag.', 'Only {count} in the bag.', 'Only {count} in the bag, I am afraid.', 'Only {count} in the bag. The bag has been thoroughly searched.'],
    yue: ['袋入面得返 {count} 件。', '袋入面得返 {count} 件。', '個袋度得返 {count} 件。', '個袋度得返 {count} 件咋，唔好意思。', '個袋度得返 {count} 件。個袋已經俾人搜過底朝天。'],
  },
  'shop.sell.worthless': {
    en: ['Nobody wants {item}.', 'Nobody wants {item}.', 'Nobody wants {item}.', 'Nobody wants {item}, sadly.', 'Nobody wants {item}. Not one soul in the whole valley.'],
    yue: ['冇人要 {item}。', '冇人要 {item}。', '冇人要 {item} 喎。', '好可惜，冇人要 {item}。', '冇人要 {item}。成個山谷一個人都唔要。'],
  },
  'shop.sell.ok': {
    en: [
      'Sold {count} {item} for {total}g.',
      'Sold {count} {item} for {total}g.',
      'Sold {count} {item} for {total}g.',
      'Sold {count} {item} for {total}g. Nicely done.',
      'Sold {count} {item} for {total}g. The purse grows fat and pleased with itself.',
    ],
    yue: [
      '賣咗 {count} 件 {item}，收 {total}g。',
      '賣咗 {count} 件 {item}，收 {total}g。',
      '賣咗 {count} 件 {item}，收 {total}g。',
      '賣咗 {count} 件 {item}，收 {total}g，做得好。',
      '賣咗 {count} 件 {item}，收 {total}g。個荷包越嚟越脹，仲好自滿。',
    ],
  },
  'shop.sellAll.none': {
    en: ['No produce in the bag.', 'No produce in the bag.', 'No produce in the bag.', 'Not a scrap of produce in the bag.', 'Not a scrap of produce in the bag. Go and grow something.'],
    yue: ['袋入面冇收成。', '袋入面冇收成。', '個袋度冇收成喎。', '個袋度一件收成都冇。', '個袋度一件收成都冇。去種啲嘢先啦。'],
  },
  'shop.sellAll.ok': {
    en: [
      'Sold {count} produce for {total}g.',
      'Sold {count} produce for {total}g.',
      'Sold {count} produce for {total}g.',
      'Sold {count} produce for {total}g. A good day at the market.',
      'Sold {count} produce for {total}g. The whole bag empties and the purse sings.',
    ],
    yue: [
      '賣咗 {count} 件收成，收 {total}g。',
      '賣咗 {count} 件收成，收 {total}g。',
      '賣咗 {count} 件收成，收 {total}g。',
      '賣咗 {count} 件收成，收 {total}g，今日市道唔錯。',
      '賣咗 {count} 件收成，收 {total}g。成個袋清空，個荷包唱住歌。',
    ],
  },
  'shop.note.crop': {
    en: [
      'Grows in {days} days, sells for {price}g.',
      'Grows in {days} days, sells for {price}g.',
      'Grows in {days} days and sells for {price}g.',
      'Ready in {days} days, worth {price}g at the counter.',
      'Ready in {days} days and worth {price}g at the counter, assuming you water it.',
    ],
    yue: [
      '{days} 日生成，賣 {price}g。',
      '{days} 日生成，賣 {price}g。',
      '{days} 日就生到，賣 {price}g。',
      '{days} 日搞掂，喺櫃檯值 {price}g。',
      '{days} 日搞掂，喺櫃檯值 {price}g——前提係你有淋水。',
    ],
  },
  'shop.note.cropRegrow': {
    en: [
      'Grows in {days} days, regrows every {regrow} days, sells for {price}g.',
      'Grows in {days} days, regrows every {regrow} days, sells for {price}g.',
      'Grows in {days} days, then regrows every {regrow} days, and sells for {price}g.',
      'Ready in {days} days, back again every {regrow} days, worth {price}g each time.',
      'Ready in {days} days, back again every {regrow} days, worth {price}g each time — the gift that keeps giving.',
    ],
    yue: [
      '{days} 日生成，每 {regrow} 日再生，賣 {price}g。',
      '{days} 日生成，每 {regrow} 日再生，賣 {price}g。',
      '{days} 日生成，之後每 {regrow} 日再生一次，賣 {price}g。',
      '{days} 日搞掂，之後每 {regrow} 日再嚟一次，次次值 {price}g。',
      '{days} 日搞掂，之後每 {regrow} 日再嚟一次，次次值 {price}g——源源不絕，識做嘢。',
    ],
  },
  'shop.note.sprinkler': {
    en: [
      'Waters {count} tiles each night.',
      'Waters {count} tiles each night.',
      'Waters {count} tiles every night.',
      'Waters {count} tiles every night, for free, forever.',
      'Waters {count} tiles every night, for free, forever, and never once asks for a day off.',
    ],
    yue: [
      '每晚淋 {count} 格。',
      '每晚淋 {count} 格。',
      '每晚淋 {count} 格泥。',
      '每晚淋 {count} 格，免費，永遠。',
      '每晚淋 {count} 格，免費，永遠，仲從來唔請假。',
    ],
  },
  'shop.note.fertilizer': {
    en: [
      'Faster growth and better quality.',
      'Faster growth and better quality.',
      'Faster growth and better quality produce.',
      'Faster growth and better produce. Worth every coin.',
      'Faster growth and better produce. Worth every single coin you throw at it.',
    ],
    yue: [
      '生得快啲，品質好啲。',
      '生得快啲，品質好啲。',
      '生得快啲，收成品質好啲。',
      '生得快、品質靚，值回票價。',
      '生得快、品質靚，你掉幾多錢落去都值。',
    ],
  },
  'shop.title': {
    en: ['Shop', 'Shop', 'The shop', 'The shop', 'The shop, and its patient shopkeeper'],
    yue: ['舖頭', '舖頭', '間舖頭', '間舖頭', '間舖頭，同埋個好有耐性嘅老闆'],
  },
  'shop.price': {
    en: ['{price}g each', '{price}g each', '{price}g each', '{price}g each', '{price}g each, take it or leave it'],
    yue: ['每件 {price}g', '每件 {price}g', '每件 {price}g', '每件 {price}g', '每件 {price}g，要就要，唔要就算'],
  },
  'shop.stock.unlimited': {
    en: ['Always in stock', 'Always in stock', 'Always in stock', 'Always in stock', 'Always in stock, somehow'],
    yue: ['長期有貨', '長期有貨', '長期有貨', '長期有貨', '長期有貨，唔知點解'],
  },
} as const

// ===========================================================================
// EXTRA — keys the shell lanes render under their own naming, where the
// wording or the parameter list is genuinely different from anything above.
// ===========================================================================

const EXTRA = {
  'settings.sections.label': {
    en: ['Settings sections', 'Settings sections', 'Settings sections', 'The settings sections', 'The settings sections, all eight of them'],
    yue: ['設定分區', '設定分區', '設定分區', '啲設定分區', '八個設定分區，一個都唔少'],
  },
  'settings.sections.count': {
    en: ['{section}, {count} settings', '{section}, {count} settings', '{section} — {count} settings', '{section}, holding {count} settings', '{section}, presiding over {count} settings'],
    yue: ['{section}，{count} 個設定', '{section}，{count} 個設定', '{section} — {count} 個設定', '{section}，入面有 {count} 個設定', '{section} 大人麾下，有 {count} 個設定'],
  },
  'settings.language.disclosure': {
    en: ['What the funny level does', 'What the funny level does', 'What the funny level actually does', 'What the funny level actually does', 'What the funny level actually does, and what it never does'],
    yue: ['搞笑程度做啲乜', '搞笑程度做啲乜', '搞笑程度究竟做啲乜', '搞笑程度究竟做啲乜', '搞笑程度做啲乜，同埋佢死都唔會做啲乜'],
  },
  'settings.language.disclosure.desc': {
    en: ['Voice changes. Facts do not.', 'Voice changes. Facts do not.', 'The voice changes. The facts do not.', 'The voice changes. The facts do not, ever.', 'The voice changes. The facts do not, ever, under any circumstances.'],
    yue: ['語氣會變，事實唔會。', '語氣會變，事實唔會。', '語氣會變，事實唔會變。', '語氣會變，事實永遠唔會變。', '語氣會變，事實永遠唔會變，冇任何例外。'],
  },
  'settings.language.disclosure.body': {
    en: [
      'The funny level changes the wording of every message, including warnings and failures. It never changes a fact: a number, a name, a file path, a key binding, an error code and a crop price read the same at every level.',
      'The funny level changes the wording of every message, including warnings and failures. It never changes a fact: a number, a name, a file path, a key binding, an error code and a crop price read the same at every level.',
      'The funny level restyles every message you will ever see, warnings and failures included. What it will never do is touch a fact — a number, a name, a file path, a key binding, an error code and a crop price read exactly the same at every level.',
      'The funny level restyles every message in the app, warnings and failures included, so do not expect a quiet life at the top of the dial. What it will never do is touch a fact: a number, a name, a file path, a key binding, an error code and a crop price read exactly the same at every level.',
      'The funny level restyles every message this app will ever say to you — warnings, failures, disasters and all. But it is under strict orders and it never touches a fact: a number, a name, a file path, a key binding, an error code and a crop price read exactly, identically, immovably the same at every level.',
    ],
    yue: [
      '搞笑程度會改變每一句訊息嘅寫法，包括警告同失敗。但佢唔會改事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，每一級都係一模一樣。',
      '搞笑程度會改變每一句訊息嘅寫法，包括警告同失敗。但佢唔會改事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，每一級都係一模一樣。',
      '搞笑程度會將你見到嘅每一句嘢重新包裝，連警告同失敗都唔例外。但佢死都唔會郁事實——數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，每一級都一模一樣。',
      '搞笑程度會將成個 app 每一句嘢重新包裝，連警告同失敗都照玩，所以扭到最盡就唔好指望有安樂茶飯。但佢死都唔會郁事實：數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，每一級都一模一樣。',
      '搞笑程度會將呢個 app 講過嘅每一句嘢重新包裝——警告、失敗、大鑊嘢，一律照玩。但佢係受過嚴令嘅：事實一粒都唔准郁。數字、名、檔案路徑、按鍵、錯誤代碼同農作物價錢，每一級都一模一樣，分毫不差。',
    ],
  },
  'settings.language.funny.desc': {
    en: [
      'English and Cantonese are dialled separately.',
      'English and Cantonese are dialled separately.',
      'English and Cantonese are dialled separately, so one can be plain while the other plays.',
      'English and Cantonese are dialled separately, so one can behave while the other misbehaves.',
      'English and Cantonese are dialled separately, so one can stay respectable while the other runs riot.',
    ],
    yue: [
      '英文同廣東話分開調。',
      '英文同廣東話分開調。',
      '英文同廣東話分開調，一個可以好正經，另一個可以玩。',
      '英文同廣東話分開調，一個乖乖哋，另一個可以扭計。',
      '英文同廣東話分開調，一個可以扮斯文，另一個可以癲晒。',
    ],
  },
  'settings.language.funny.level': {
    en: ['Level {level}', 'Level {level}', 'Level {level}', 'Level {level}', 'Level {level}'],
    yue: ['第 {level} 級', '第 {level} 級', '第 {level} 級', '第 {level} 級', '第 {level} 級'],
  },
  'settings.language.sampleLine': {
    en: [
      '{crop} sells for {price}g. Press {key} to sleep.',
      '{crop} sells for {price}g. Press {key} to sleep.',
      'A {crop} sells for {price}g, and {key} puts you to bed.',
      'A {crop} will fetch you {price}g, and {key} puts you to bed. Not bad.',
      'A single {crop} will fetch you a princely {price}g, and one press of {key} sends you to bed a richer soul.',
    ],
    yue: [
      '{crop} 賣 {price}g。撳 {key} 去瞓。',
      '{crop} 賣 {price}g。撳 {key} 去瞓。',
      '一個 {crop} 賣 {price}g，撳 {key} 就可以去瞓。',
      '一個 {crop} 有 {price}g 落袋，撳 {key} 就上床，唔錯喎。',
      '得一個 {crop}，都有堂堂 {price}g 落袋；輕輕撳一下 {key}，你就富貴地瞓落床。',
    ],
  },
  'settings.language.changed': {
    en: ['Language set to {lang}.', 'Language set to {lang}.', 'Now speaking {lang}.', 'Right then — {lang} it is.', 'From this moment on, we speak {lang}.'],
    yue: ['語言已設為 {lang}。', '語言已設為 {lang}。', '而家講緊 {lang}。', '好啦，就 {lang} 啦。', '由呢一刻起，我哋講 {lang}。'],
  },
  'settings.motion.captions': {
    en: ['Caption the game', 'Caption the game', 'Caption what the game does', 'Caption what the game does', 'Caption everything the game does, in words'],
    yue: ['遊戲字幕', '遊戲字幕', '將遊戲做嘅嘢寫出嚟', '將遊戲做嘅嘢寫成字', '將遊戲做嘅每一樣嘢，寫晒做字'],
  },
  'settings.motion.captions.desc': {
    en: [
      'Show game messages as text in the shell as well as on the canvas.',
      'Show game messages as text in the shell as well as on the canvas.',
      'Game messages appear as real text in the shell, not only as pixels on the canvas.',
      'Game messages appear as real text in the shell, not only as pixels a screen reader cannot read.',
      'Game messages appear as real, selectable text in the shell, not only as pixels a screen reader would stare at helplessly.',
    ],
    yue: [
      '遊戲訊息除咗畫喺 canvas，仲會喺外殼用文字顯示。',
      '遊戲訊息除咗畫喺 canvas，仲會喺外殼用文字顯示。',
      '遊戲訊息會喺外殼度變成真文字，唔淨係 canvas 上面啲 pixel。',
      '遊戲訊息會變成真文字，唔淨係啲讀屏軟件讀唔到嘅 pixel。',
      '遊戲訊息會變成真真正正、揀得到嘅文字，唔使讀屏軟件對住啲 pixel 乾瞪眼。',
    ],
  },
  'settings.motion.changed': {
    en: ['Motion set to {mode}. Currently {effective}.', 'Motion set to {mode}. Currently {effective}.', 'Motion is now {mode}, which works out as {effective}.', 'Motion is now {mode}, which works out as {effective} right now.', 'Motion is now {mode}, which after consulting your system works out as {effective}.'],
    yue: ['動態設為 {mode}，而家實際係 {effective}。', '動態設為 {mode}，而家實際係 {effective}。', '動態而家係 {mode}，實際行出嚟係 {effective}。', '動態而家係 {mode}，計落實際係 {effective}。', '動態而家係 {mode}，同你部機商量完之後，實際係 {effective}。'],
  },
  'settings.motion.verbosity': {
    en: ['Announcement detail', 'Announcement detail', 'How much is announced', 'How much gets announced', 'How much the live region says out loud'],
    yue: ['播報詳細程度', '播報詳細程度', '播幾多嘢', '會播幾多嘢出嚟', 'Live region 會嗌幾多嘢出嚟'],
  },
  'settings.motion.verbosity.desc': {
    en: [
      'How much detail the screen reader live region carries.',
      'How much detail the screen reader live region carries.',
      'How much detail goes into the live region a screen reader reads.',
      'How much detail goes into the live region — terse, or the full running commentary.',
      'How much detail goes into the live region: terse, or the full breathless running commentary.',
    ],
    yue: [
      'Live region 畀讀屏軟件嘅內容有幾詳細。',
      'Live region 畀讀屏軟件嘅內容有幾詳細。',
      '讀屏軟件讀嗰個 live region 有幾詳細。',
      'Live region 有幾詳細——簡短，定係全程旁述。',
      'Live region 有幾詳細：簡短兩句，定係喘住氣嘅全程旁述。',
    ],
  },
  'settings.motion.verbosity.changed': {
    en: ['Announcement detail set to {level}.', 'Announcement detail set to {level}.', 'Announcement detail is now {level}.', 'Announcement detail is now {level}.', 'Announcement detail is now {level}. The live region has been informed.'],
    yue: ['播報詳細程度設為 {level}。', '播報詳細程度設為 {level}。', '播報詳細程度而家係 {level}。', '播報詳細程度而家係 {level}。', '播報詳細程度而家係 {level}。Live region 已收到通知。'],
  },
  'settings.motion.farmNote': {
    en: [
      'The farm honours this setting too.',
      'The farm honours this setting too.',
      'The farm honours this setting as well as the shell.',
      'The farm honours this setting as well as the shell — both surfaces, one preference.',
      'The farm honours this setting as well as the shell. Two surfaces, one preference, no arguing.',
    ],
    yue: [
      '塊田都會跟呢個設定。',
      '塊田都會跟呢個設定。',
      '塊田同外殼都會跟呢個設定。',
      '塊田同外殼都跟呢個設定——兩邊，一個偏好。',
      '塊田同外殼都跟呢個設定。兩塊畫面，一個偏好，冇得駁嘴。',
    ],
  },
  'settings.scale.changed': {
    en: ['Scale set to {scale}.', 'Scale set to {scale}.', 'Scale is now {scale}.', 'Scale is now {scale}.', 'Scale is now {scale}, and everything has shuffled to suit.'],
    yue: ['比例設為 {scale}。', '比例設為 {scale}。', '比例而家係 {scale}。', '比例而家係 {scale}。', '比例而家係 {scale}，所有嘢已經自動歸位。'],
  },
  'settings.audio.volume': {
    en: ['Volume', 'Volume', 'Volume', 'How loud', 'How loud the valley is allowed to be'],
    yue: ['音量', '音量', '音量', '幾大聲', '個山谷可以大聲到咩程度'],
  },
  'settings.audio.volume.desc': {
    en: [
      'The master gain for every synthesised sound.',
      'The master gain for every synthesised sound.',
      'The master gain for every sound the app makes up.',
      'The master gain for every sound the app makes up on the spot.',
      'The master gain for every sound the app conjures out of arithmetic on the spot.',
    ],
    yue: [
      '所有合成音效嘅總音量。',
      '所有合成音效嘅總音量。',
      '個 app 整出嚟嗰啲聲嘅總音量。',
      '個 app 即場整出嚟嗰啲聲嘅總音量。',
      '個 app 用數學即場變出嚟嗰啲聲嘅總音量。',
    ],
  },
  'settings.audio.volume.value': {
    en: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
    yue: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
  },
  'settings.audio.muted': {
    en: ['Muted', 'Muted', 'Muted', 'Muted, and quite peaceful', 'Muted. The valley holds its breath.'],
    yue: ['已靜音', '已靜音', '靜咗音', '靜晒音，好平靜', '靜晒音。成個山谷屏住呼吸。'],
  },
  'settings.audio.unmuted': {
    en: ['Sound on', 'Sound on', 'Sound on', 'Sound on and audible', 'Sound on. The valley clears its throat.'],
    yue: ['有聲', '有聲', '出返聲', '有聲，聽得到', '有聲喇。成個山谷清一清喉嚨。'],
  },
  'settings.audio.test.played': {
    en: ['That is what it sounds like.', 'That is what it sounds like.', 'That is what it sounds like.', 'That is what it sounds like. Happy?', 'That is what it sounds like. A tiny masterpiece, made of arithmetic.'],
    yue: ['把聲就係咁。', '把聲就係咁。', '把聲就係咁囉。', '把聲就係咁，滿意未？', '把聲就係咁。一個由數學砌出嚟嘅微型傑作。'],
  },
  'settings.game.farmKeys': {
    en: ['Farm keys in the shell', 'Farm keys in the shell', 'Farm keys while the shell has focus', 'Farm keys while the shell has focus', 'Whether farm keys still work while the shell has focus'],
    yue: ['外殼度用農場按鍵', '外殼度用農場按鍵', '焦點喺外殼時嘅農場按鍵', '焦點喺外殼時，農場按鍵仲用唔用得', '焦點喺外殼度嗰陣，啲農場按鍵仲使唔使得'],
  },
  'settings.game.farmKeys.desc': {
    en: [
      'Whether the game keys work when a shell control has focus.',
      'Whether the game keys work when a shell control has focus.',
      'Whether the game keys still reach the farm when a shell control has focus.',
      'Whether the game keys still reach the farm when a shell control has focus. Off is safer for typing.',
      'Whether the game keys still reach the farm when a shell control has focus. Off is safer, unless you enjoy sowing seeds mid-sentence.',
    ],
    yue: [
      '焦點喺外殼控制項時，遊戲按鍵用唔用得。',
      '焦點喺外殼控制項時，遊戲按鍵用唔用得。',
      '焦點喺外殼控制項嗰陣，遊戲按鍵仲入唔入到塊田。',
      '焦點喺外殼嗰陣，遊戲按鍵仲入唔入到塊田。閂咗打字安全啲。',
      '焦點喺外殼嗰陣，遊戲按鍵仲入唔入到塊田。閂咗安全啲，除非你鍾意打字打到一半突然落咗粒種。',
    ],
  },
  'settings.game.farmKeys.changed': {
    en: ['Farm keys set to {mode}.', 'Farm keys set to {mode}.', 'Farm keys are now {mode}.', 'Farm keys are now {mode}.', 'Farm keys are now {mode}, and the farm has been told.'],
    yue: ['農場按鍵設為 {mode}。', '農場按鍵設為 {mode}。', '農場按鍵而家係 {mode}。', '農場按鍵而家係 {mode}。', '農場按鍵而家係 {mode}，塊田已經收到通知。'],
  },
  'settings.game.keepAwake': {
    en: ['Keep the screen awake', 'Keep the screen awake', 'Keep the screen awake', 'Keep the screen from sleeping', 'Keep the screen from nodding off mid-harvest'],
    yue: ['防止螢幕熄', '防止螢幕熄', '唔好熄螢幕', '唔好畀螢幕瞓着', '唔好畀螢幕收成收到一半就瞓着'],
  },
  'settings.game.keepAwake.desc': {
    en: [
      'Uses the browser wake lock while the farm is visible.',
      'Uses the browser wake lock while the farm is visible.',
      'Uses the browser wake lock while the farm tab is visible.',
      'Uses the browser wake lock while the farm tab is visible, and gives it back when it is not.',
      'Uses the browser wake lock while the farm tab is visible, and hands it straight back when it is not. No hoarding.',
    ],
    yue: [
      '塊田睇得見嗰陣會用瀏覽器 wake lock。',
      '塊田睇得見嗰陣會用瀏覽器 wake lock。',
      '農場分頁睇得見嗰陣會用瀏覽器 wake lock。',
      '農場分頁睇得見先用 wake lock，唔見就即刻還返。',
      '農場分頁睇得見先用 wake lock，一唔見就即刻還返，唔會霸住。',
    ],
  },
  'settings.game.keepAwake.idle': {
    en: ['Not held', 'Not held', 'Not held right now', 'Not held right now', 'Not held right now, and quite relaxed about it'],
    yue: ['未攞住', '未攞住', '而家冇攞住', '而家冇攞住', '而家冇攞住，佢好淡定'],
  },
  'settings.game.keepAwake.held': {
    en: ['Held', 'Held', 'Held right now', 'Held right now', 'Held right now, and holding firm'],
    yue: ['已攞住', '已攞住', '而家攞住', '而家攞住', '而家攞住，攞到實一實'],
  },
  'settings.game.keepAwake.refused': {
    en: ['The system refused it.', 'The system refused it.', 'The system refused the request.', 'The system said no.', 'The system said no, flatly, and offered no reason.'],
    yue: ['系統拒絕咗。', '系統拒絕咗。', '系統唔批呢個請求。', '系統話唔得。', '系統一口拒絕，仲要唔講原因。'],
  },
  'settings.game.keepAwake.unsupported': {
    en: ['Not supported here.', 'Not supported here.', 'Not supported on this machine.', 'Not supported on this machine, sadly.', 'Not supported on this machine. Some things are simply not to be.'],
    yue: ['呢度唔支援。', '呢度唔支援。', '呢部機唔支援。', '呢部機唔支援，好可惜。', '呢部機唔支援。有啲嘢，就係無緣。'],
  },
  'settings.game.muteOnBlur': {
    en: ['Mute when the window is away', 'Mute when the window is away', 'Mute when the window loses focus', 'Mute the moment the window loses focus', 'Mute the instant the window loses focus, out of sheer politeness'],
    yue: ['個窗唔喺前面就靜音', '個窗唔喺前面就靜音', '個窗失去焦點就靜音', '個窗一失去焦點就即刻靜音', '個窗一失去焦點就即刻收聲，純粹出於禮貌'],
  },
  'settings.game.muteOnBlur.desc': {
    en: [
      'The valley goes quiet when you switch to something else.',
      'The valley goes quiet when you switch to something else.',
      'The valley goes quiet the moment you switch to something else.',
      'The valley goes quiet the moment you switch away, and speaks up again when you come back.',
      'The valley goes quiet the moment you switch away, and clears its throat again the moment you return.',
    ],
    yue: [
      '你去咗第二度，個山谷就靜。',
      '你去咗第二度，個山谷就靜。',
      '你一轉去第二度，個山谷即刻靜晒。',
      '你一轉去第二度個山谷就靜，返嚟就出返聲。',
      '你一轉去第二度個山谷即刻收聲，你一返嚟佢又清一清喉嚨。',
    ],
  },
  'settings.appearance.editor': {
    en: ['The appearance editor', 'The appearance editor', 'The appearance editor', 'The appearance editor', 'The appearance editor, and how to summon it'],
    yue: ['外觀編輯器', '外觀編輯器', '外觀編輯器', '個外觀編輯器', '個外觀編輯器，同埋點召喚佢'],
  },
  'settings.appearance.editor.desc': {
    en: [
      'Every rendered element can be edited and reset.',
      'Every rendered element can be edited and reset.',
      'Every element on screen can be edited, and every edit can be reset.',
      'Every element on screen can be edited, and every edit put back. Nothing is permanent.',
      'Every element on screen can be edited, and every edit put back. Nothing here is permanent, least of all your taste.',
    ],
    yue: [
      '每個畫出嚟嘅元素都改到、還原到。',
      '每個畫出嚟嘅元素都改到、還原到。',
      '畫面上每件嘢都改到，每個改動都還原到。',
      '畫面上每件嘢都改到，每個改動都還原到，冇嘢係永久嘅。',
      '畫面上每件嘢都改到，每個改動都還原到。呢度冇嘢係永久嘅，尤其係你嘅品味。',
    ],
  },
  'settings.appearance.editor.hint': {
    en: [
      'Right-click an element, or press {chord} while it has focus.',
      'Right-click an element, or press {chord} while it has focus.',
      'Right-click any element, or press {chord} while it has focus.',
      'Right-click anything at all, or press {chord} while it has focus.',
      'Right-click anything at all, or press {chord} while it has focus. Nothing is safe from you.',
    ],
    yue: [
      '喺元素上面右 click，或者當佢有焦點時撳 {chord}。',
      '喺元素上面右 click，或者當佢有焦點時撳 {chord}。',
      '喺任何元素上面右 click，或者當佢有焦點時撳 {chord}。',
      '想改邊樣就右 click 邊樣，或者佢有焦點時撳 {chord}。',
      '想改邊樣就右 click 邊樣，或者佢有焦點時撳 {chord}。呢度冇嘢逃得出你手。',
    ],
  },
  'settings.appearance.editor.open': {
    en: ['Open the appearance editor', 'Open the appearance editor', 'Open the appearance editor', 'Open the appearance editor', 'Summon the appearance editor'],
    yue: ['開外觀編輯器', '開外觀編輯器', '開個外觀編輯器', '打開個外觀編輯器', '召喚個外觀編輯器出嚟'],
  },
  'settings.appearance.colour': {
    en: ['Palette colours', 'Palette colours', 'The palette colours', 'The fourteen palette colours', 'All fourteen palette colours, yours to repoint'],
    yue: ['調色板顏色', '調色板顏色', '啲調色板顏色', '十四隻調色板顏色', '十四隻調色板顏色，任你改'],
  },
  'settings.appearance.colour.desc': {
    en: [
      'Both surfaces draw from these fourteen entries.',
      'Both surfaces draw from these fourteen entries.',
      'The game and the shell both draw from these fourteen entries.',
      'The game and the shell both draw from these fourteen entries. Change one and both follow.',
      'The game and the shell both draw from these fourteen entries. Change one and the whole valley changes with it.',
    ],
    yue: [
      '兩塊畫面都係用呢十四隻色。',
      '兩塊畫面都係用呢十四隻色。',
      '遊戲同外殼都係用呢十四隻色。',
      '遊戲同外殼都係用呢十四隻色，改一隻兩邊一齊變。',
      '遊戲同外殼都係用呢十四隻色。改一隻，成個山谷跟住變。',
    ],
  },
  'settings.appearance.colour.reset': {
    en: ['Reset this colour', 'Reset this colour', 'Put this colour back', 'Put this colour back how it was', 'Return this colour to the valley it came from'],
    yue: ['重設呢隻色', '重設呢隻色', '呢隻色還原', '呢隻色打返原形', '呢隻色，送返佢個山谷度'],
  },
  'settings.appearance.colour.wasReset': {
    en: ['{name} is back to {base}.', '{name} is back to {base}.', '{name} is back to {base}.', '{name} has gone back to {base}.', '{name} has marched back to {base}, older and wiser.'],
    yue: ['{name} 還原做 {base}。', '{name} 還原做 {base}。', '{name} 返咗做 {base}。', '{name} 返咗去 {base}。', '{name} 一步一步行返去 {base}，經一事長一智。'],
  },
  'settings.appearance.resetAll.action': {
    en: ['Reset all appearance', 'Reset all appearance', 'Reset every appearance change', 'Undo every appearance change', 'Undo every last appearance change in one sweep'],
    yue: ['重設所有外觀', '重設所有外觀', '所有外觀改動重設', '所有外觀改動一次過還原', '所有外觀改動，一鋪過打回原形'],
  },
  'settings.appearance.resetAll.desc': {
    en: [
      'Every element goes back to the stylesheet.',
      'Every element goes back to the stylesheet.',
      'Every element goes back to what the stylesheet says.',
      'Every element goes back to what the stylesheet says, and your edits are gone.',
      'Every element goes back to what the stylesheet says, and every edit you made is quietly forgotten.',
    ],
    yue: [
      '每個元素返返樣式表講嗰個樣。',
      '每個元素返返樣式表講嗰個樣。',
      '每個元素返返樣式表講嗰個樣。',
      '每個元素返返樣式表講嗰個樣，你啲改動就冇晒。',
      '每個元素返返樣式表講嗰個樣，你改過嘅嘢會被靜靜雞忘記。',
    ],
  },
  'settings.appearance.resetAll.confirmTitle': {
    en: ['Reset all appearance?', 'Reset all appearance?', 'Reset every appearance change?', 'Really undo every appearance change?', 'Truly undo every appearance change you ever made?'],
    yue: ['重設所有外觀？', '重設所有外觀？', '所有外觀改動都重設？', '真係要還原晒所有外觀改動？', '真係要將你改過嘅每一樣外觀都打回原形？'],
  },
  'settings.appearance.resetAll.confirmBody': {
    en: ['Every element goes back to its default. This cannot be undone.', 'Every element goes back to its default. This cannot be undone.', 'Every element goes back to its default, and there is no undo.', 'Every element goes back to its default. There is no undo for this one.', 'Every element marches back to its default. There is no undo, no backup and no mercy.'],
    yue: ['每個元素都會還原做預設，冇得 undo。', '每個元素都會還原做預設，冇得 undo。', '每個元素都會還原做預設，而且冇得 undo。', '每個元素都會還原做預設。呢個真係冇得 undo。', '每個元素齊步走返預設。冇得 undo、冇備份、冇同情。'],
  },
  'settings.appearance.resetAll.done': {
    en: ['{count} elements reset.', '{count} elements reset.', '{count} elements are back to their defaults.', '{count} elements are back to their defaults.', '{count} elements have returned to their defaults, blinking.'],
    yue: ['重設咗 {count} 個元素。', '重設咗 {count} 個元素。', '{count} 個元素還原咗做預設。', '{count} 個元素還原咗做預設。', '{count} 個元素返咗做預設，仲喺度眨緊眼。'],
  },
  'settings.data.export.action': {
    en: ['Export now', 'Export now', 'Export it now', 'Export it now', 'Export it now, while you remember'],
    yue: ['即刻匯出', '即刻匯出', '而家匯出佢', '而家匯出佢啦', '趁記得，即刻匯出佢'],
  },
  'settings.data.export.desc': {
    en: [
      'Pick a target and a format. Nothing is uploaded.',
      'Pick a target and a format. Nothing is uploaded.',
      'Pick what to export and in what format. Nothing is uploaded anywhere.',
      'Pick what to export and in what format. Nothing is uploaded anywhere, to anyone.',
      'Pick what to export and in what format. Nothing is uploaded anywhere, to anyone, ever.',
    ],
    yue: [
      '揀個目標同格式。唔會上傳。',
      '揀個目標同格式。唔會上傳。',
      '揀匯出咩、用咩格式。唔會上傳去任何地方。',
      '揀匯出咩、用咩格式。唔會上傳去任何地方、任何人。',
      '揀匯出咩、用咩格式。唔會上傳去任何地方、任何人，永遠都唔會。',
    ],
  },
  'settings.data.export.done': {
    en: ['Saved {filename}, {bytes} bytes.', 'Saved {filename}, {bytes} bytes.', 'Saved {filename} — {bytes} bytes.', 'Saved {filename}, all {bytes} bytes of it.', 'Saved {filename}, all {bytes} bytes of it. Look after it.'],
    yue: ['已儲存 {filename}，{bytes} bytes。', '已儲存 {filename}，{bytes} bytes。', '存咗做 {filename}——{bytes} bytes。', '存咗做 {filename}，足足 {bytes} bytes。', '存咗做 {filename}，足足 {bytes} bytes。好好保管佢。'],
  },
  'settings.data.export.failed': {
    en: ['Could not export {target} as {format}.', 'Could not export {target} as {format}.', 'That export of {target} as {format} did not work.', 'The export of {target} as {format} fell over.', 'The export of {target} as {format} fell over in spectacular fashion.'],
    yue: ['匯出唔到 {target}（{format}）。', '匯出唔到 {target}（{format}）。', '{target} 匯出成 {format} 唔成功。', '{target} 匯出成 {format} 仆咗街。', '{target} 匯出成 {format}，轟轟烈烈咁仆咗街。'],
  },
  'settings.data.export.unavailable': {
    en: ['Downloads are unavailable here.', 'Downloads are unavailable here.', 'Downloads are not available in this build.', 'Downloads are not available in this build, sorry.', 'Downloads are not available in this build. Copy it to the clipboard instead.'],
    yue: ['呢度用唔到下載。', '呢度用唔到下載。', '呢個版本用唔到下載。', '呢個版本用唔到下載，唔好意思。', '呢個版本用唔到下載，你 copy 落剪貼簿啦。'],
  },
  'settings.data.import.action': {
    en: ['Choose a file', 'Choose a file', 'Choose a file', 'Choose a file to bring in', 'Choose a file, and let us see what is in it'],
    yue: ['揀個檔案', '揀個檔案', '揀個檔案', '揀個檔案搬入嚟', '揀個檔案，睇下入面有咩'],
  },
  'settings.data.import.desc': {
    en: [
      'Reads a file this app exported earlier.',
      'Reads a file this app exported earlier.',
      'Reads a file this app exported earlier. Nothing else is accepted.',
      'Reads a file this app exported earlier. It will not take anything else.',
      'Reads a file this app exported earlier, and flatly refuses anything else.',
    ],
    yue: [
      '讀返呢個 app 之前匯出嘅檔案。',
      '讀返呢個 app 之前匯出嘅檔案。',
      '讀返呢個 app 之前匯出嘅檔案，其他一律唔收。',
      '讀返呢個 app 之前匯出嘅檔案，第二啲佢唔收。',
      '讀返呢個 app 之前匯出嘅檔案，其他嘢一概拒收。',
    ],
  },
  'settings.data.import.confirmTitle': {
    en: ['Import and replace?', 'Import and replace?', 'Import and replace what is here?', 'Import this and replace what is here?', 'Import this and replace everything currently here?'],
    yue: ['匯入並取代？', '匯入並取代？', '匯入，然後取代而家啲嘢？', '匯入呢份，取代而家啲嘢？', '匯入呢份，取代晒而家所有嘢？'],
  },
  'settings.data.import.confirmBody': {
    en: [
      '{file} replaces: {parts}. This cannot be undone.',
      '{file} replaces: {parts}. This cannot be undone.',
      '{file} will replace: {parts}. There is no undo.',
      '{file} will replace: {parts}. There is no undo for this one.',
      '{file} will replace: {parts}. There is no undo, no backup and no going back.',
    ],
    yue: [
      '{file} 會取代：{parts}。冇得 undo。',
      '{file} 會取代：{parts}。冇得 undo。',
      '{file} 會取代：{parts}，而且冇得 undo。',
      '{file} 會取代：{parts}。呢個真係冇得 undo。',
      '{file} 會取代：{parts}。冇得 undo、冇備份、冇轉頭路。',
    ],
  },
  'settings.data.import.done': {
    en: ['Imported.', 'Imported.', 'Imported and applied.', 'Imported and applied. Everything is in.', 'Imported and applied. Everything arrived safely.'],
    yue: ['已匯入。', '已匯入。', '匯入咗，已套用。', '匯入咗，已套用，全部入晒嚟。', '匯入咗，已套用。全部平安抵達。'],
  },
  'settings.data.import.failed': {
    en: ['Could not import {file}.', 'Could not import {file}.', '{file} could not be imported.', '{file} refused to be imported.', '{file} refused to be imported, and offered no explanation.'],
    yue: ['匯入唔到 {file}。', '匯入唔到 {file}。', '{file} 匯入唔到。', '{file} 死都唔肯畀人匯入。', '{file} 死都唔肯畀人匯入，仲要唔講原因。'],
  },
  'settings.data.import.noFile': {
    en: ['No file was chosen.', 'No file was chosen.', 'No file was chosen.', 'No file was chosen, so nothing happened.', 'No file was chosen, so absolutely nothing happened.'],
    yue: ['冇揀檔案。', '冇揀檔案。', '你冇揀檔案。', '冇揀檔案，所以乜都冇發生。', '冇揀檔案，所以真係乜都冇發生。'],
  },
  'settings.data.import.nothing': {
    en: ['{file} held nothing to import.', '{file} held nothing to import.', '{file} had nothing in it to import.', '{file} had nothing in it worth importing.', '{file} had nothing in it worth importing. A beautiful, empty gesture.'],
    yue: ['{file} 入面冇嘢好匯入。', '{file} 入面冇嘢好匯入。', '{file} 入面冇嘢可以匯入。', '{file} 入面冇嘢值得匯入。', '{file} 入面冇嘢值得匯入。一個美麗而空洞嘅動作。'],
  },
  'settings.data.import.unreadable': {
    en: ['{file} could not be read.', '{file} could not be read.', '{file} could not be read.', '{file} makes no sense at all.', '{file} makes no sense whatsoever, and we tried very hard.'],
    yue: ['讀唔到 {file}。', '讀唔到 {file}。', '{file} 讀唔到。', '{file} 完全睇唔明。', '{file} 完全睇唔明，我哋已經好努力。'],
  },
  'settings.data.import.unavailable': {
    en: ['File reading is unavailable here.', 'File reading is unavailable here.', 'File reading is not available in this build.', 'File reading is not available in this build, sorry.', 'File reading is not available in this build. Paste the text instead.'],
    yue: ['呢度讀唔到檔案。', '呢度讀唔到檔案。', '呢個版本讀唔到檔案。', '呢個版本讀唔到檔案，唔好意思。', '呢個版本讀唔到檔案，你直接貼段字入嚟啦。'],
  },
  'settings.data.clearHistory.action': {
    en: ['Clear the history', 'Clear the history', 'Clear the history', 'Wipe the history', 'Wipe the history and forget it all'],
    yue: ['清除歷史', '清除歷史', '清走歷史紀錄', '抹走歷史紀錄', '抹走歷史紀錄，當乜都冇發生過'],
  },
  'settings.data.clearHistory.desc': {
    en: [
      'Deletes the local history. Settings and appearance stay.',
      'Deletes the local history. Settings and appearance stay.',
      'Deletes the local history and leaves your settings and appearance alone.',
      'Deletes the local history and leaves your settings and appearance untouched.',
      'Deletes the local history and leaves your settings and appearance entirely untouched.',
    ],
    yue: [
      '刪除本機歷史，設定同外觀照留。',
      '刪除本機歷史，設定同外觀照留。',
      '刪除本機歷史，你嘅設定同外觀唔會郁。',
      '刪除本機歷史，你嘅設定同外觀一啲都唔會郁。',
      '刪除本機歷史，你嘅設定同外觀一條毛都唔會郁到。',
    ],
  },
  'settings.data.clearHistory.confirmTitle': {
    en: ['Clear the history?', 'Clear the history?', 'Clear the history?', 'Really wipe the history?', 'Truly wipe every trace of the past?'],
    yue: ['清除歷史？', '清除歷史？', '清走歷史紀錄？', '真係抹走歷史紀錄？', '真係要抹走過去嘅所有痕跡？'],
  },
  'settings.data.clearHistory.confirmBody': {
    en: ['Every entry is deleted. This cannot be undone.', 'Every entry is deleted. This cannot be undone.', 'Every entry is deleted, and there is no undo.', 'Every entry goes in the bin, and there is no undo.', 'Every entry goes in the bin, never to be seen again. There is no undo.'],
    yue: ['所有紀錄都會刪除，冇得 undo。', '所有紀錄都會刪除，冇得 undo。', '所有紀錄都會刪除，而且冇得 undo。', '所有紀錄掉落垃圾桶，冇得 undo。', '所有紀錄掉落垃圾桶，永不超生。冇得 undo。'],
  },
  'settings.data.clearHistory.done': {
    en: ['The history is cleared.', 'The history is cleared.', 'The history is cleared.', 'The history is gone.', 'The history is gone without a trace.'],
    yue: ['歷史清咗喇。', '歷史清咗喇。', '歷史紀錄清晒。', '歷史紀錄冇晒。', '歷史紀錄冇晒，一絲痕跡都冇留低。'],
  },
  'settings.data.clearHistory.failed': {
    en: ['The history could not be cleared.', 'The history could not be cleared.', 'The history could not be cleared.', 'The history refused to be cleared.', 'The history refused to be cleared. It clings on.'],
    yue: ['清唔到歷史。', '清唔到歷史。', '歷史清唔到。', '歷史死都唔肯畀人清。', '歷史死都唔肯畀人清，仲要死攬住唔放。'],
  },
  'settings.data.clearHistory.unavailable': {
    en: ['There is no history to clear.', 'There is no history to clear.', 'There is no history to clear.', 'There is no history here to clear.', 'There is no history here to clear. You have been admirably restrained.'],
    yue: ['冇歷史可以清。', '冇歷史可以清。', '冇歷史紀錄可以清。', '呢度冇歷史紀錄可以清。', '呢度冇歷史紀錄可以清。你真係克制得令人佩服。'],
  },
  'settings.data.resetAll.action': {
    en: ['Reset everything', 'Reset everything', 'Reset everything', 'Wipe the lot', 'Wipe the lot and start from nothing'],
    yue: ['重設所有嘢', '重設所有嘢', '所有嘢重設', '一鋪清晒', '一鋪清袋，由零開始'],
  },
  'settings.data.resetAll.failed': {
    en: ['The reset did not finish.', 'The reset did not finish.', 'The reset did not finish.', 'The reset fell over halfway.', 'The reset fell over halfway, which is the worst possible place.'],
    yue: ['重設冇完成到。', '重設冇完成到。', '重設做唔完。', '重設做到一半仆咗。', '重設做到一半仆咗，仲要係最衰嗰個位。'],
  },
  'settings.about.accessibility': {
    en: ['Accessibility', 'Accessibility', 'Accessibility', 'Accessibility', 'Accessibility, and how seriously we take it'],
    yue: ['無障礙', '無障礙', '無障礙', '無障礙', '無障礙，同埋我哋有幾認真'],
  },
  'settings.about.accessibility.desc': {
    en: [
      'Keyboard reachable, screen reader friendly, reduced motion honoured.',
      'Keyboard reachable, screen reader friendly, reduced motion honoured.',
      'Everything is keyboard reachable, screen readers are told the truth, and reduced motion is honoured.',
      'Everything is keyboard reachable, screen readers are told the truth, and reduced motion is honoured everywhere.',
      'Everything is keyboard reachable, screen readers are told the truth, and reduced motion is honoured everywhere. No costumes.',
    ],
    yue: [
      '鍵盤到得晒、讀屏軟件友善、跟足減少動態。',
      '鍵盤到得晒、讀屏軟件友善、跟足減少動態。',
      '樣樣鍵盤到得，讀屏軟件收到嘅係真相，減少動態照跟。',
      '樣樣鍵盤到得，讀屏軟件收到嘅係真相，減少動態邊度都跟。',
      '樣樣鍵盤到得，讀屏軟件收到嘅係真相，減少動態邊度都跟。冇扮嘢。',
    ],
  },
  'settings.about.licence.desc': {
    en: ['The licence this application ships under.', 'The licence this application ships under.', 'The licence this application ships under.', 'The licence this application ships under. Read it if you like.', 'The licence this application ships under. Read it, if that is your idea of an evening.'],
    yue: ['呢個 app 用嘅授權條款。', '呢個 app 用嘅授權條款。', '呢個 app 用緊嘅授權條款。', '呢個 app 用緊嘅授權條款，想睇就睇。', '呢個 app 用緊嘅授權條款。你當夜晚娛樂咁睇都得。'],
  },
  'settings.about.licence.missing': {
    en: ['The licence text is not bundled.', 'The licence text is not bundled.', 'The licence text is not bundled in this build.', 'The licence text is not bundled in this build, awkwardly.', 'The licence text is not bundled in this build, which is faintly embarrassing.'],
    yue: ['授權全文冇打包入嚟。', '授權全文冇打包入嚟。', '呢個 build 冇打包授權全文。', '呢個 build 冇打包授權全文，幾尷尬。', '呢個 build 冇打包授權全文，講起上嚟都有啲面紅。'],
  },
  'settings.about.version.desc': {
    en: ['The build and its save format.', 'The build and its save format.', 'The build, and the save format it reads.', 'The build, and the save format it can read.', 'The build, and the save format it will happily read.'],
    yue: ['呢個 build 同佢個存檔格式。', '呢個 build 同佢個存檔格式。', '呢個 build，同佢讀得嘅存檔格式。', '呢個 build，同佢讀得到嘅存檔格式。', '呢個 build，同佢好樂意讀嘅存檔格式。'],
  },
  'settings.about.version.value': {
    en: ['Version {version}, save format {save}', 'Version {version}, save format {save}', 'Version {version}, save format {save}', 'Version {version}, save format {save}', 'Version {version}, save format {save}'],
    yue: ['版本 {version}，存檔格式 {save}', '版本 {version}，存檔格式 {save}', '版本 {version}，存檔格式 {save}', '版本 {version}，存檔格式 {save}', '版本 {version}，存檔格式 {save}'],
  },
  'settings.about.version.unknown': {
    en: ['Unknown', 'Unknown', 'Unknown', 'Nobody knows', 'Nobody knows, and nobody will say'],
    yue: ['不明', '不明', '唔知', '冇人知', '冇人知，亦都冇人肯講'],
  },
  'settings.about.version.copy': {
    en: ['Copy the version', 'Copy the version', 'Copy the version', 'Copy the version', 'Copy the version, for the bug report'],
    yue: ['複製版本號', '複製版本號', 'Copy 版本號', 'Copy 低個版本號', 'Copy 低個版本號，報 bug 嗰陣用'],
  },
  'settings.about.version.copied': {
    en: ['Copied {version}.', 'Copied {version}.', 'Copied {version}.', '{version} is on your clipboard.', '{version} now lives in your clipboard.'],
    yue: ['已複製 {version}。', '已複製 {version}。', 'Copy 咗 {version}。', '{version} 喺你 clipboard 度。', '{version} 而家住咗喺你剪貼簿度。'],
  },
  'settings.search.placeholder': {
    en: ['Search settings', 'Search settings', 'What are you looking for?', 'What are you after?', 'Name it and it shall be found'],
    yue: ['搜尋設定', '搜尋設定', '你搵緊咩？', '想搵咩呀？', '講個名出嚟，包搵到'],
  },
  'settings.search.describe': {
    en: [
      'Every setting label, description and value on this tab.',
      'Every setting label, description and value on this tab.',
      'Every setting label, description and value on this tab.',
      'Every label, description and value on this tab, all at once.',
      'Every label, description and value on this tab, all at once, and nothing hides.',
    ],
    yue: [
      '呢版所有設定嘅標題、說明同數值。',
      '呢版所有設定嘅標題、說明同數值。',
      '呢版所有設定嘅標題、說明同數值。',
      '呢版所有標題、說明、數值，一次過搵晒。',
      '呢版所有標題、說明、數值，一次過搵晒，冇一個匿得埋。',
    ],
  },
  'settings.search.idle': {
    en: ['{count} settings.', '{count} settings.', '{count} settings on this tab.', '{count} settings on this tab, waiting.', '{count} settings on this tab, waiting to be fiddled with.'],
    yue: ['{count} 個設定。', '{count} 個設定。', '呢版有 {count} 個設定。', '呢版有 {count} 個設定喺度等。', '呢版有 {count} 個設定，等緊你去扭。'],
  },
  'settings.search.results': {
    en: ['{count} settings match {query}.', '{count} settings match {query}.', '{count} settings match {query}.', '{count} settings answered to {query}.', '{count} settings came running when you said {query}.'],
    yue: ['{count} 個設定啱 {query}。', '{count} 個設定啱 {query}。', '有 {count} 個設定啱 {query}。', '{count} 個設定應咗 {query} 呢個名。', '你嗌一聲 {query}，就有 {count} 個設定走晒出嚟。'],
  },
  'settings.search.matches': {
    en: ['{count} matches in the sample.', '{count} matches in the sample.', '{count} matches in the sample.', '{count} matches found in the sample.', '{count} matches hunted down in the sample.'],
    yue: ['樣本入面有 {count} 個配對。', '樣本入面有 {count} 個配對。', '樣本入面搵到 {count} 個配對。', '樣本入面搵到 {count} 個配對。', '樣本入面畀人捉咗 {count} 個配對出嚟。'],
  },
  'settings.search.invalid': {
    en: ['Not a valid pattern at character {index}: {error}', 'Not a valid pattern at character {index}: {error}', 'The pattern breaks at character {index}: {error}', 'The pattern falls over at character {index}: {error}', 'The pattern falls flat on its face at character {index}: {error}'],
    yue: ['Pattern 喺第 {index} 個字元出錯：{error}', 'Pattern 喺第 {index} 個字元出錯：{error}', '個 pattern 喺第 {index} 個字元爆咗：{error}', '個 pattern 喺第 {index} 個字元冧咗：{error}', '個 pattern 喺第 {index} 個字元一嘢仆街：{error}'],
  },
  'settings.search.timedOut': {
    en: ['The pattern took too long and was stopped.', 'The pattern took too long and was stopped.', 'The pattern was taking too long, so it was stopped.', 'The pattern went wandering, so it was stopped.', 'The pattern wandered off into the wilderness, so it was hauled back.'],
    yue: ['個 pattern 跑得太耐，畀人叫停。', '個 pattern 跑得太耐，畀人叫停。', '個 pattern 行得太耐，所以叫停咗。', '個 pattern 遊魂咗，所以叫停咗佢。', '個 pattern 遊魂到入咗荒野，畀人捉咗返嚟。'],
  },
  'settings.search.dialect': {
    en: ['Dialect: {dialect}.', 'Dialect: {dialect}.', 'This searches with {dialect}.', 'This searches with {dialect}, and nothing else.', 'This searches with {dialect}, and nothing else. No lookbehind fantasies.'],
    yue: ['方言：{dialect}。', '方言：{dialect}。', '呢度用 {dialect} 搵嘢。', '呢度淨係用 {dialect} 搵嘢，冇第二款。', '呢度淨係用 {dialect}，冇第二款。唔好發夢諗其他語法。'],
  },
  'settings.search.sample': {
    en: ['Sample text, up to {limit} characters', 'Sample text, up to {limit} characters', 'Sample text, up to {limit} characters', 'Sample text, {limit} characters at most', 'Sample text, {limit} characters at most, for everyone’s sake'],
    yue: ['樣本文字，最多 {limit} 個字元', '樣本文字，最多 {limit} 個字元', '樣本文字，最多 {limit} 個字元', '樣本文字，最多都係 {limit} 個字元', '樣本文字，最多 {limit} 個字元，為大家好'],
  },
  'settings.search.copied': {
    en: ['Copied {pattern}.', 'Copied {pattern}.', 'Copied {pattern}.', '{pattern} is on your clipboard.', '{pattern} now lives in your clipboard.'],
    yue: ['已複製 {pattern}。', '已複製 {pattern}。', 'Copy 咗 {pattern}。', '{pattern} 喺你 clipboard 度。', '{pattern} 而家住咗喺你剪貼簿度。'],
  },
  'settings.search.inSection': {
    en: ['In {section}', 'In {section}', 'In {section}', 'Over in {section}', 'Over in {section}, since you ask'],
    yue: ['喺 {section}', '喺 {section}', '喺 {section} 入面', '喺 {section} 嗰邊', '喺 {section} 嗰邊，你問我咪話你知'],
  },
  'settings.search.apply': {
    en: ['Apply the pattern', 'Apply the pattern', 'Apply the pattern', 'Put the pattern to work', 'Set the pattern loose on the settings'],
    yue: ['套用個 pattern', '套用個 pattern', '用個 pattern', '放個 pattern 出嚟做嘢', '放個 pattern 出嚟掃過成版設定'],
  },
  'settings.search.reloadSample': {
    en: ['Reload the sample', 'Reload the sample', 'Reload the sample text', 'Reload the sample text', 'Fetch a fresh sample to torment'],
    yue: ['重新載入樣本', '重新載入樣本', '重新載入樣本文字', '換過段樣本文字', '換段新鮮樣本嚟蹂躪'],
  },
  'settings.search.insertLiteral': {
    en: ['Insert as literal text', 'Insert as literal text', 'Insert it as literal text, escaped', 'Insert it as literal text, escaped for you', 'Insert it as literal text, escaped for you, no surprises'],
    yue: ['以字面文字插入', '以字面文字插入', '當字面文字插入，會自動 escape', '當字面文字插入，幫你 escape 埋', '當字面文字插入，幫你 escape 埋，冇突發驚喜'],
  },
  'settings.search.regexToggleHint': {
    en: [
      'Plain text is the default. Regex is an explicit choice.',
      'Plain text is the default. Regex is an explicit choice.',
      'Plain text unless you say otherwise — regex is always an explicit choice.',
      'Plain text unless you say otherwise. Regex is always your explicit choice.',
      'Plain text unless you say otherwise. Regex is always your explicit choice, and your responsibility.',
    ],
    yue: [
      '預設純文字，regex 要你自己開。',
      '預設純文字，regex 要你自己開。',
      '唔講就係純文字——regex 永遠都要你自己揀。',
      '唔講就係純文字。Regex 永遠都要你自己揀。',
      '唔講就係純文字。Regex 永遠都要你自己揀，出事都係你自己孭。',
    ],
  },
  'settings.search.token.named': {
    en: ['Named group', 'Named group', 'A named capture group', 'A named capture group', 'A named capture group, for the organised'],
    yue: ['具名群組', '具名群組', '有名嘅捕獲群組', '有名嘅捕獲群組', '有名嘅捕獲群組，畀啲有條理嘅人用'],
  },
  'settings.search.token.notClass': {
    en: ['None of these characters', 'None of these characters', 'None of these characters', 'Anything except these characters', 'Anything at all except these characters'],
    yue: ['唔可以係呢啲字元', '唔可以係呢啲字元', '呢啲字元一律唔要', '除咗呢啲字元，乜都得', '除咗呢啲字元，其他乜都得'],
  },
  'settings.search.token.count': {
    en: ['A counted repeat', 'A counted repeat', 'A counted repeat', 'A repeat with a count on it', 'A repeat with a strict count on it'],
    yue: ['指定次數嘅重複', '指定次數嘅重複', '指定次數嘅重複', '有次數限制嘅重複', '有嚴格次數限制嘅重複'],
  },

  // ---- the dim sum surprise, as the docs lane names it ---------------------

  'surprise.toggle': {
    en: ['Show the dim sum trolley', 'Show the dim sum trolley', 'Show the dim sum trolley', 'Bring out the dim sum trolley', 'Wheel out the dim sum trolley, and mind the tea'],
    yue: ['推出點心車', '推出點心車', '推架點心車出嚟', '推架點心車出嚟啦', '推架點心車出嚟，小心啲茶'],
  },
  'surprise.command.toggle': {
    en: ['Dim sum: show or hide the trolley', 'Dim sum: show or hide the trolley', 'Dim sum: show or hide the trolley', 'Dim sum: wheel the trolley in or out', 'Dim sum: wheel the trolley in, or wheel it sadly away'],
    yue: ['點心：推出或者收返架車', '點心：推出或者收返架車', '點心：推出或者收返架車', '點心：架車推出嚟定推返入去', '點心：架車推出嚟，定係依依不捨咁推返入去'],
  },
  'surprise.group': {
    en: ['Appearance', 'Appearance', 'Appearance', 'Appearance', 'Appearance'],
    yue: ['外觀', '外觀', '外觀', '外觀', '外觀'],
  },

  // ---- the appearance editor, as the appearance lane names it -------------

  'appearance.editor.close': {
    en: ['Close the editor', 'Close the editor', 'Close the editor', 'Put the editor away', 'Dismiss the editor, with thanks'],
    yue: ['閂編輯器', '閂編輯器', '閂咗個編輯器', '收埋個編輯器', '多謝晒，編輯器請回'],
  },
  'appearance.editor.properties': {
    en: ['Properties', 'Properties', 'Properties', 'The properties', 'Every property, laid out for you'],
    yue: ['屬性', '屬性', '屬性', '啲屬性', '每一個屬性，攤晒出嚟畀你'],
  },
  'appearance.menu.title': {
    en: ['Appearance of {element}', 'Appearance of {element}', 'How {element} looks', 'Dressing up {element}', 'The complete wardrobe of {element}'],
    yue: ['{element} 嘅外觀', '{element} 嘅外觀', '{element} 個樣', '幫 {element} 執下個型', '{element} 嘅全套行頭'],
  },
  'appearance.menu.items': {
    en: ['Appearance actions', 'Appearance actions', 'Things you can do here', 'Things you can do to it', 'Everything you can do to this poor element'],
    yue: ['外觀動作', '外觀動作', '呢度做得咩', '你可以對佢做啲乜', '你可以對呢件可憐嘅嘢做嘅所有嘢'],
  },
  'appearance.field.borderWidth': {
    en: ['Border width', 'Border width', 'Border width', 'How thick the frame is', 'How thick the carved frame is'],
    yue: ['邊框粗幼', '邊框粗幼', '邊框粗幼', '個框有幾粗', '個雕花木框有幾粗'],
  },
  'appearance.field.edit': {
    en: ['Edit {property}, currently {value}', 'Edit {property}, currently {value}', 'Edit {property} — currently {value}', 'Change {property}, which is {value} right now', 'Change {property}, which is currently sporting {value}'],
    yue: ['編輯 {property}，而家係 {value}', '編輯 {property}，而家係 {value}', '改 {property}——而家係 {value}', '改 {property}，佢而家係 {value}', '改 {property}，佢而家着緊 {value}'],
  },
  'appearance.field.number': {
    en: ['{property} in {unit}', '{property} in {unit}', '{property}, in {unit}', '{property}, measured in {unit}', '{property}, measured in {unit}, precisely'],
    yue: ['{property}（{unit}）', '{property}（{unit}）', '{property}，單位 {unit}', '{property}，用 {unit} 量', '{property}，用 {unit} 量到準過準'],
  },
  'appearance.field.slider': {
    en: ['{property} slider, in {unit}', '{property} slider, in {unit}', '{property} slider, in {unit}', 'Slide to set {property}, in {unit}', 'Slide to set {property}, in {unit}, to your heart’s content'],
    yue: ['{property} 滑桿（{unit}）', '{property} 滑桿（{unit}）', '{property} 滑桿，單位 {unit}', '拉住佢調 {property}，單位 {unit}', '拉住佢調 {property}，單位 {unit}，調到你滿意為止'],
  },
  'appearance.field.value': {
    en: ['{value}{unit}', '{value}{unit}', '{value}{unit}', '{value}{unit}', '{value}{unit}'],
    yue: ['{value}{unit}', '{value}{unit}', '{value}{unit}', '{value}{unit}', '{value}{unit}'],
  },
  'appearance.resetAll.done': {
    en: ['{count} elements reset.', '{count} elements reset.', '{count} elements are back to their defaults.', '{count} elements are back to their defaults.', '{count} elements have returned to their defaults, blinking.'],
    yue: ['重設咗 {count} 個元素。', '重設咗 {count} 個元素。', '{count} 個元素還原咗做預設。', '{count} 個元素還原咗做預設。', '{count} 個元素返咗做預設，仲喺度眨緊眼。'],
  },
  'appearance.colorpicker.swatches': {
    en: ['Palette swatches', 'Palette swatches', 'The palette swatches', 'The fourteen palette swatches', 'All fourteen palette swatches, lined up'],
    yue: ['調色板色板', '調色板色板', '啲調色板色板', '十四塊調色板色板', '十四塊調色板色板，排到成行'],
  },

  // ---- the colour picker, as the appearance lane names it -----------------

  'colorpicker.label': {
    en: ['Colour picker', 'Colour picker', 'Colour picker', 'The colour picker', 'The colour picker, in all its glory'],
    yue: ['顏色揀選器', '顏色揀選器', '顏色揀選器', '個顏色揀選器', '個顏色揀選器，隆重登場'],
  },
  'colorpicker.field': {
    en: ['Saturation and brightness', 'Saturation and brightness', 'Saturation and brightness', 'Drag for saturation and brightness', 'Drag about for saturation and brightness'],
    yue: ['飽和度同光暗', '飽和度同光暗', '飽和度同光暗', '拖住揀飽和度同光暗', '周圍拖，揀飽和度同光暗'],
  },
  'colorpicker.fieldHelp': {
    en: [
      'Arrow keys move by one, Page Up and Page Down by ten, Home and End to the edges.',
      'Arrow keys move by one, Page Up and Page Down by ten, Home and End to the edges.',
      'Arrow keys move by one, Page Up and Page Down by ten, and Home and End go to the edges.',
      'Arrow keys nudge by one, Page Up and Page Down leap by ten, Home and End take you to the edges.',
      'Arrow keys nudge by one, Page Up and Page Down leap by ten, and Home and End fling you to the edges.',
    ],
    yue: [
      '方向鍵一格一格，Page Up／Page Down 十格，Home／End 去兩邊盡頭。',
      '方向鍵一格一格，Page Up／Page Down 十格，Home／End 去兩邊盡頭。',
      '方向鍵一格一格咁郁，Page Up／Page Down 一次十格，Home／End 直去盡頭。',
      '方向鍵推一格，Page Up／Page Down 一躍十格，Home／End 直送盡頭。',
      '方向鍵推一格，Page Up／Page Down 一躍十格，Home／End 一嘢掟你去盡頭。',
    ],
  },
  'colorpicker.fieldValue': {
    en: [
      'Saturation {saturation}, brightness {brightness}, {hex}',
      'Saturation {saturation}, brightness {brightness}, {hex}',
      'Saturation {saturation}, brightness {brightness} — {hex}',
      'Saturation {saturation}, brightness {brightness}, which comes out as {hex}',
      'Saturation {saturation}, brightness {brightness}, which comes out, magnificently, as {hex}',
    ],
    yue: [
      '飽和度 {saturation}，光暗 {brightness}，{hex}',
      '飽和度 {saturation}，光暗 {brightness}，{hex}',
      '飽和度 {saturation}，光暗 {brightness}——{hex}',
      '飽和度 {saturation}，光暗 {brightness}，出嚟就係 {hex}',
      '飽和度 {saturation}，光暗 {brightness}，威威咁出嚟就係 {hex}',
    ],
  },
  'colorpicker.fieldValueNamed': {
    en: [
      'Saturation {saturation}, brightness {brightness}, {hex}, which is {name}',
      'Saturation {saturation}, brightness {brightness}, {hex}, which is {name}',
      'Saturation {saturation}, brightness {brightness}, {hex} — that is {name}',
      'Saturation {saturation}, brightness {brightness}, {hex}, and that one has a name: {name}',
      'Saturation {saturation}, brightness {brightness}, {hex}, and that one has a proper name: {name}',
    ],
    yue: [
      '飽和度 {saturation}，光暗 {brightness}，{hex}，即係 {name}',
      '飽和度 {saturation}，光暗 {brightness}，{hex}，即係 {name}',
      '飽和度 {saturation}，光暗 {brightness}，{hex}——就係 {name}',
      '飽和度 {saturation}，光暗 {brightness}，{hex}，呢隻仲有個名：{name}',
      '飽和度 {saturation}，光暗 {brightness}，{hex}，呢隻仲有個堂堂正正嘅名：{name}',
    ],
  },
  'colorpicker.hue': {
    en: ['Hue', 'Hue', 'Hue', 'Hue', 'Hue, the whole rainbow of it'],
    yue: ['色相', '色相', '色相', '色相', '色相，成條彩虹畀你揀'],
  },
  'colorpicker.hueValue': {
    en: ['{degrees} degrees', '{degrees} degrees', '{degrees} degrees', '{degrees} degrees round the wheel', '{degrees} degrees round the wheel, exactly'],
    yue: ['{degrees} 度', '{degrees} 度', '{degrees} 度', '喺個色環上 {degrees} 度', '喺個色環上啱啱好 {degrees} 度'],
  },
  'colorpicker.saturation': {
    en: ['Saturation', 'Saturation', 'Saturation', 'Saturation', 'Saturation, how much colour is in the colour'],
    yue: ['飽和度', '飽和度', '飽和度', '飽和度', '飽和度，即係隻色入面有幾多色'],
  },
  'colorpicker.brightness': {
    en: ['Brightness', 'Brightness', 'Brightness', 'Brightness', 'Brightness, from the pit to the noon'],
    yue: ['光暗', '光暗', '光暗', '光暗', '光暗，由黑漆漆到正午'],
  },
  'colorpicker.alpha': {
    en: ['Opacity', 'Opacity', 'Opacity', 'How solid it is', 'How solid, or how ghostly'],
    yue: ['透明度', '透明度', '透明度', '有幾實淨', '幾實淨，定係幾似鬼影'],
  },
  'colorpicker.percent': {
    en: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
    yue: ['{percent}%', '{percent}%', '{percent}%', '{percent}%', '{percent}%'],
  },
  'colorpicker.hex': {
    en: ['Hex', 'Hex', 'Hex', 'Hex', 'Hex, for the purists'],
    yue: ['Hex', 'Hex', 'Hex', 'Hex', 'Hex，畀原教旨主義者用'],
  },
  'colorpicker.rgb': {
    en: ['RGB', 'RGB', 'RGB', 'RGB', 'RGB, red green blue, the old way'],
    yue: ['RGB', 'RGB', 'RGB', 'RGB', 'RGB，紅綠藍，老派做法'],
  },
  'colorpicker.hsl': {
    en: ['HSL', 'HSL', 'HSL', 'HSL', 'HSL, for people who think in hues'],
    yue: ['HSL', 'HSL', 'HSL', 'HSL', 'HSL，畀慣用色相諗嘢嗰啲人'],
  },
  'colorpicker.preview': {
    en: ['Preview of {hex}', 'Preview of {hex}', 'A preview of {hex}', 'A preview of {hex}, as it will look', 'A preview of {hex}, exactly as it will look on the wood'],
    yue: ['{hex} 預覽', '{hex} 預覽', '{hex} 嘅預覽', '{hex} 嘅預覽，實際就係咁', '{hex} 嘅預覽，畫落塊木上面就係咁'],
  },
  'colorpicker.named': {
    en: ['{name}', '{name}', '{name}', '{name}', '{name}'],
    yue: ['{name}', '{name}', '{name}', '{name}', '{name}'],
  },
  'colorpicker.custom': {
    en: ['Custom {hex}', 'Custom {hex}', 'Your own {hex}', 'Your own {hex}, off the palette', 'Your own {hex}, chosen from outside the fourteen'],
    yue: ['自訂 {hex}', '自訂 {hex}', '你自己嘅 {hex}', '你自己揀嘅 {hex}，唔喺調色板入面', '你自己揀嘅 {hex}，十四隻色以外嘅選擇'],
  },
  'colorpicker.chose': {
    en: ['Chose {name}, {hex}.', 'Chose {name}, {hex}.', 'Chose {name} — {hex}.', 'You picked {name}, which is {hex}.', 'You picked {name}, which is {hex}. Good eye.'],
    yue: ['揀咗 {name}，{hex}。', '揀咗 {name}，{hex}。', '揀咗 {name}——{hex}。', '你揀咗 {name}，即係 {hex}。', '你揀咗 {name}，即係 {hex}。好眼光。'],
  },
  'colorpicker.swatch': {
    en: ['{name}, {hex}', '{name}, {hex}', '{name} — {hex}', '{name}, which is {hex}', '{name}, which is {hex}, since you ask'],
    yue: ['{name}，{hex}', '{name}，{hex}', '{name} — {hex}', '{name}，即係 {hex}', '{name}，即係 {hex}，你問我咪話你知'],
  },
  'colorpicker.swatches': {
    en: ['Palette', 'Palette', 'The palette', 'The valley palette', 'The valley palette, all fourteen of it'],
    yue: ['調色板', '調色板', '個調色板', '山谷調色板', '山谷調色板，十四隻齊晒'],
  },
  'colorpicker.swatchCount': {
    en: ['{shown} of {total} colours match {query}.', '{shown} of {total} colours match {query}.', '{shown} of {total} colours match {query}.', '{shown} of {total} colours answered to {query}.', '{shown} of {total} colours came running when you said {query}.'],
    yue: ['{total} 隻色入面有 {shown} 隻啱 {query}。', '{total} 隻色入面有 {shown} 隻啱 {query}。', '{total} 隻色入面有 {shown} 隻啱 {query}。', '{total} 隻色入面，{shown} 隻應咗 {query}。', '你嗌一聲 {query}，{total} 隻色入面走咗 {shown} 隻出嚟。'],
  },
  'colorpicker.swatchCountAll': {
    en: ['{total} colours.', '{total} colours.', 'All {total} colours.', 'All {total} colours, present and correct.', 'All {total} colours, present, correct and accounted for.'],
    yue: ['{total} 隻色。', '{total} 隻色。', '總共 {total} 隻色。', '{total} 隻色，全部到齊。', '{total} 隻色，全部到齊，點名無誤。'],
  },
  'colorpicker.contrastPass': {
    en: [
      'Contrast {ratio} to 1 against {against}, above the required {required}.',
      'Contrast {ratio} to 1 against {against}, above the required {required}.',
      'Contrast is {ratio} to 1 against {against}, comfortably above the required {required}.',
      'Contrast is {ratio} to 1 against {against}, comfortably clear of the required {required}.',
      'Contrast is {ratio} to 1 against {against}, sailing clear of the required {required}.',
    ],
    yue: [
      '對比 {against} 係 {ratio} 比 1，高過要求嘅 {required}。',
      '對比 {against} 係 {ratio} 比 1，高過要求嘅 {required}。',
      '對住 {against} 嘅對比度係 {ratio} 比 1，穩穩陣陣高過要求嘅 {required}。',
      '對住 {against} 嘅對比度係 {ratio} 比 1，離要求嘅 {required} 有餘。',
      '對住 {against} 嘅對比度係 {ratio} 比 1，輕輕鬆鬆越過要求嘅 {required}。',
    ],
  },
  'colorpicker.contrastFail': {
    en: [
      'Contrast {ratio} to 1 against {against}, below the required {required}.',
      'Contrast {ratio} to 1 against {against}, below the required {required}.',
      'Contrast is only {ratio} to 1 against {against}, under the required {required}.',
      'Contrast is a feeble {ratio} to 1 against {against}, under the required {required}.',
      'Contrast limps in at {ratio} to 1 against {against}, well under the required {required}.',
    ],
    yue: [
      '對比 {against} 得 {ratio} 比 1，低過要求嘅 {required}。',
      '對比 {against} 得 {ratio} 比 1，低過要求嘅 {required}。',
      '對住 {against} 嘅對比度得 {ratio} 比 1，未夠要求嘅 {required}。',
      '對住 {against} 嘅對比度得可憐嘅 {ratio} 比 1，未夠要求嘅 {required}。',
      '對住 {against} 嘅對比度拖住條腳行到 {ratio} 比 1，離要求嘅 {required} 差好遠。',
    ],
  },
  'colorpicker.contrastShort': {
    en: ['{ratio} to 1, needs {required}', '{ratio} to 1, needs {required}', '{ratio} to 1, needs {required}', '{ratio} to 1, and it needs {required}', '{ratio} to 1, and it needs {required}, so there is work to do'],
    yue: ['{ratio} 比 1，要 {required}', '{ratio} 比 1，要 {required}', '{ratio} 比 1，要 {required}', '{ratio} 比 1，但要 {required}', '{ratio} 比 1，但要 {required}，即係仲要執'],
  },
  'colorpicker.searchLabel': {
    en: ['Search palette colours', 'Search palette colours', 'Search the palette', 'Hunt through the palette', 'Interrogate all fourteen palette colours'],
    yue: ['搜尋調色板顏色', '搜尋調色板顏色', '搵調色板啲色', '喺調色板度掘下', '十四隻色，逐隻查一次'],
  },
  'colorpicker.searchPlaceholder': {
    en: ['Search colours', 'Search colours', 'Search colours', 'Which colour?', 'Name the colour you want'],
    yue: ['搜尋顏色', '搜尋顏色', '搵色', '要邊隻色？', '講你想要邊隻色'],
  },

  // ---- the shared search field, as the picker lane names it ---------------

  'search.mode.regexShort': {
    en: ['Regex', 'Regex', 'Regex', 'Regex', 'Regex'],
    yue: ['Regex', 'Regex', 'Regex', 'Regex', 'Regex'],
  },
  'search.builder.title': {
    en: ['Build a pattern', 'Build a pattern', 'Build a pattern', 'Build yourself a pattern', 'Build yourself a pattern, piece by piece'],
    yue: ['砌個 pattern', '砌個 pattern', '砌個 pattern', '自己砌個 pattern', '一嚿一嚿咁砌個 pattern 出嚟'],
  },
  'search.builder.short': {
    en: ['Builder', 'Builder', 'Builder', 'Builder', 'Builder'],
    yue: ['建構器', '建構器', '建構器', '建構器', '建構器'],
  },
  'search.builder.pattern': {
    en: ['Pattern', 'Pattern', 'The pattern', 'The pattern itself', 'The pattern itself, raw and unashamed'],
    yue: ['Pattern', 'Pattern', '個 pattern', '個 pattern 本身', '個 pattern 本身，原汁原味'],
  },
  'search.builder.flags': {
    en: ['Flags: {flags}', 'Flags: {flags}', 'Flags: {flags}', 'Flags in play: {flags}', 'Flags currently in play: {flags}'],
    yue: ['Flags：{flags}', 'Flags：{flags}', 'Flags：{flags}', '而家用緊嘅 flags：{flags}', '而家用緊嘅 flags：{flags}'],
  },
  'search.builder.noFlags': {
    en: ['none', 'none', 'none', 'none at all', 'not a single one'],
    yue: ['冇', '冇', '一個都冇', '一個都冇', '一個都冇，乾淨企理'],
  },
  'search.builder.emptyPattern': {
    en: ['empty', 'empty', 'empty', 'completely empty', 'completely, gloriously empty'],
    yue: ['空', '空', '空嘅', '完全係空', '完全係空，得個吉字'],
  },
  'search.builder.effectivePattern': {
    en: ['Effective pattern: {pattern}', 'Effective pattern: {pattern}', 'The pattern that will run: {pattern}', 'The pattern that will actually run: {pattern}', 'The pattern that will actually be unleashed: {pattern}'],
    yue: ['實際 pattern：{pattern}', '實際 pattern：{pattern}', '真正會行嘅 pattern：{pattern}', '真正會行嘅 pattern：{pattern}', '真正會放出嚟嘅 pattern：{pattern}'],
  },
  'search.builder.patternValid': {
    en: ['{pattern} with flags {flags} is valid.', '{pattern} with flags {flags} is valid.', '{pattern} with flags {flags} is good.', '{pattern} with flags {flags} is good to go.', '{pattern} with flags {flags} is in perfect health.'],
    yue: ['{pattern} 配 flags {flags}，正確。', '{pattern} 配 flags {flags}，正確。', '{pattern} 配 flags {flags}，冇問題。', '{pattern} 配 flags {flags}，冇問題，用得。', '{pattern} 配 flags {flags}，health 爆燈，用得。'],
  },
  'search.builder.patternError': {
    en: ['The pattern is not valid: {error}', 'The pattern is not valid: {error}', 'That pattern does not work: {error}', 'That pattern is broken: {error}', 'That pattern is a shambles, and here is why: {error}'],
    yue: ['個 pattern 唔正確：{error}', '個 pattern 唔正確：{error}', '呢個 pattern 用唔到：{error}', '呢個 pattern 壞咗：{error}', '呢個 pattern 亂到冇朋友，原因係：{error}'],
  },
  'search.builder.patternUnknownError': {
    en: ['The pattern is not valid.', 'The pattern is not valid.', 'That pattern does not work, and it will not say why.', 'That pattern is broken, and it will not say why.', 'That pattern is broken, and it refuses point blank to say why.'],
    yue: ['個 pattern 唔正確。', '個 pattern 唔正確。', '呢個 pattern 用唔到，仲唔講原因。', '呢個 pattern 壞咗，仲要唔講原因。', '呢個 pattern 壞咗，仲要死口唔講原因。'],
  },
  'search.builder.insert': {
    en: ['Insert', 'Insert', 'Insert it', 'Drop it in', 'Drop it into the pattern'],
    yue: ['插入', '插入', '插入佢', '掟佢入去', '掟佢入個 pattern 度'],
  },
  'search.builder.insertLiteral': {
    en: ['Insert as literal text', 'Insert as literal text', 'Insert it as literal text, escaped', 'Insert it as literal text, escaped for you', 'Insert it as literal text, escaped for you, no surprises'],
    yue: ['以字面文字插入', '以字面文字插入', '當字面文字插入，會自動 escape', '當字面文字插入，幫你 escape 埋', '當字面文字插入，幫你 escape 埋，冇突發驚喜'],
  },
  'search.builder.copy': {
    en: ['Copy the pattern', 'Copy the pattern', 'Copy the pattern', 'Grab a copy of the pattern', 'Take a copy of this fine pattern'],
    yue: ['複製個 pattern', '複製個 pattern', 'Copy 個 pattern', 'Copy 低個 pattern', 'Copy 低呢個靚 pattern'],
  },
  'search.builder.copied': {
    en: ['Copied {pattern}.', 'Copied {pattern}.', 'Copied {pattern}.', '{pattern} is on your clipboard.', '{pattern} now lives in your clipboard.'],
    yue: ['已複製 {pattern}。', '已複製 {pattern}。', 'Copy 咗 {pattern}。', '{pattern} 喺你 clipboard 度。', '{pattern} 而家住咗喺你剪貼簿度。'],
  },
  'search.builder.copyFailed': {
    en: ['The clipboard refused {pattern}.', 'The clipboard refused {pattern}.', 'The clipboard would not take {pattern}.', 'The clipboard would not take {pattern}, so select it and copy it yourself.', 'The clipboard turned its nose up at {pattern}. Select it and copy it yourself.'],
    yue: ['剪貼簿唔收 {pattern}。', '剪貼簿唔收 {pattern}。', '剪貼簿唔肯收 {pattern}。', '剪貼簿唔肯收 {pattern}，你自己揀咗佢 copy 啦。', '剪貼簿擰轉面唔要 {pattern}。你自己揀咗佢 copy 啦。'],
  },
  'search.builder.pieces': {
    en: ['Pattern pieces', 'Pattern pieces', 'The pattern pieces', 'The pieces you can add', 'Every piece you can drop into the pattern'],
    yue: ['Pattern 零件', 'Pattern 零件', '啲 pattern 零件', '你可以加嘅零件', '所有可以掟入個 pattern 嘅零件'],
  },
  'search.builder.pieceDigit': {
    en: ['A digit', 'A digit', 'A digit', 'A digit, zero to nine', 'A digit, zero through nine, no exceptions'],
    yue: ['數字', '數字', '一個數字', '一個數字，零到九', '一個數字，零到九，冇例外'],
  },
  'search.builder.pieceWord': {
    en: ['A word character', 'A word character', 'A word character', 'A letter, digit or underscore', 'A letter, a digit or a humble underscore'],
    yue: ['字詞字元', '字詞字元', '一個字詞字元', '字母、數字或者底線', '字母、數字，或者卑微嘅底線'],
  },
  'search.builder.pieceLetters': {
    en: ['A letter', 'A letter', 'Any letter', 'Any letter, upper or lower', 'Any letter at all, upper case or lower'],
    yue: ['一個字母', '一個字母', '任何字母', '任何字母，大細楷都得', '任何字母，大楷細楷一律歡迎'],
  },
  'search.builder.pieceAny': {
    en: ['Any character', 'Any character', 'Any character at all', 'Any character at all', 'Absolutely any character at all'],
    yue: ['任何字元', '任何字元', '任何一個字元都得', '乜字元都得', '乜字元都得，一個都唔挑'],
  },
  'search.builder.pieceGroup': {
    en: ['Group', 'Group', 'Group', 'Group them together', 'Bundle them together as one'],
    yue: ['群組', '群組', '群組', '將佢哋圈埋一齊', '將佢哋捆做一嚿'],
  },
  'search.builder.pieceAlternation': {
    en: ['Either or', 'Either or', 'This or that', 'This one or that one', 'This one, or that one — the pattern will not mind'],
    yue: ['二揀一', '二揀一', '呢個或者嗰個', '呢個定嗰個都得', '呢個定嗰個都得，個 pattern 唔會嬲'],
  },
  'search.builder.pieceOptional': {
    en: ['Once or not at all', 'Once or not at all', 'Once, or not at all', 'Once, or not at all', 'Once, or not at all — no pressure'],
    yue: ['有或者冇', '有或者冇', '一次，或者冇', '一次，或者索性冇', '一次，或者索性冇——唔勉強'],
  },
  'search.builder.pieceOneOrMore': {
    en: ['One or more', 'One or more', 'One or more', 'At least one', 'At least one, and as many as it likes'],
    yue: ['一個或以上', '一個或以上', '一個或者更多', '最少一個', '最少一個，鍾意幾多個都得'],
  },
  'search.builder.pieceZeroOrMore': {
    en: ['Zero or more', 'Zero or more', 'Any number, including none', 'Any number at all, including none', 'Any number at all, none very much included'],
    yue: ['零個或以上', '零個或以上', '幾多個都得，冇都得', '幾多個都得，一個都冇都得', '幾多個都得，一個都冇都完全 OK'],
  },
  'search.builder.startAnchor': {
    en: ['Start of text', 'Start of text', 'Start of the text', 'Right at the start', 'Right at the very start, and nowhere else'],
    yue: ['文字開頭', '文字開頭', '文字開頭', '一開頭嗰度', '就喺最開頭嗰度，第二度都唔得'],
  },
  'search.builder.endAnchor': {
    en: ['End of text', 'End of text', 'End of the text', 'Right at the end', 'Right at the very end, and nowhere else'],
    yue: ['文字結尾', '文字結尾', '文字結尾', '最尾嗰度', '就喺最尾嗰度，第二度都唔得'],
  },
  'search.builder.wholeWord': {
    en: ['Whole words only', 'Whole words only', 'Whole words only', 'Whole words only, no fragments', 'Whole words only. Fragments need not apply.'],
    yue: ['淨係要完整字詞', '淨係要完整字詞', '淨係要完整字詞', '淨係要完整字詞，唔要半截', '淨係要完整字詞。半截嘅唔使報名。'],
  },
  'search.builder.caseSensitive': {
    en: ['Match case', 'Match case', 'Match upper and lower case', 'Match upper and lower case exactly', 'Match upper and lower case exactly, to the letter'],
    yue: ['分大細楷', '分大細楷', '要分大細楷', '大細楷要一模一樣', '大細楷要一模一樣，一個字母都唔准差'],
  },
  'search.builder.multiline': {
    en: ['Multiline anchors', 'Multiline anchors', 'Anchors match each line', 'Anchors match each line, not just the whole text', 'Anchors bite at each line, not just the whole text'],
    yue: ['多行錨點', '多行錨點', '錨點對每一行都生效', '錨點對每一行生效，唔淨係成段', '錨點喺每一行都咬一啖，唔淨係成段'],
  },
  'search.builder.unicode': {
    en: ['Unicode', 'Unicode', 'Full Unicode', 'Full Unicode, emoji and all', 'Full Unicode, emoji, accents and all'],
    yue: ['Unicode', 'Unicode', '完整 Unicode', '完整 Unicode，連 emoji 都得', '完整 Unicode，emoji、重音符號，樣樣都得'],
  },

  // ---- the notification stack, the title bar and the tab strip ------------

  'notify.stackLabel': {
    en: ['Notifications', 'Notifications', 'Notifications', 'Notifications', 'Notifications, stacked politely'],
    yue: ['通知', '通知', '通知', '通知', '通知，好有禮貌咁疊住'],
  },
  'notify.queued': {
    en: ['{count} more waiting.', '{count} more waiting.', '{count} more are waiting their turn.', '{count} more are waiting their turn, patiently.', '{count} more are queueing up, patiently, like a very British bus stop.'],
    yue: ['仲有 {count} 個等緊。', '仲有 {count} 個等緊。', '仲有 {count} 個排住隊等。', '仲有 {count} 個好有耐性咁排住隊。', '仲有 {count} 個排住隊，秩序井然，好似排巴士咁。'],
  },
  'notify.progressBusy': {
    en: ['Working…', 'Working…', 'Working on it…', 'Working on it, hold tight…', 'Working on it, hold tight, do not touch anything…'],
    yue: ['處理緊…', '處理緊…', '做緊嘢…', '做緊嘢，等陣先…', '做緊嘢，等陣先，唔好郁任何嘢…'],
  },
  'notify.progressPercent': {
    en: ['{percent}%', '{percent}%', '{percent}%', '{percent}% of the way there', '{percent}% of the way there and going strong'],
    yue: ['{percent}%', '{percent}%', '{percent}%', '行咗 {percent}%', '行咗 {percent}%，仲好精神'],
  },
  'notify.confirm.ok': {
    en: ['Confirm', 'Confirm', 'Yes, do it', 'Yes, do it', 'Yes. Do it.'],
    yue: ['確認', '確認', '好，做啦', '好，做啦', '好。做。'],
  },
  'notify.confirm.cancel': {
    en: ['Cancel', 'Cancel', 'Never mind', 'Nope, back out', 'Abort the whole affair'],
    yue: ['取消', '取消', '算數', '唔好啦，走先', '收皮，唔玩喇'],
  },
  'notify.confirm.destructiveHint': {
    en: ['{action} cannot be undone.', '{action} cannot be undone.', 'There is no undo for {action}.', 'There is no undo for {action}, none at all.', 'There is no undo for {action}. No backup, no second chance, no kindly stranger.'],
    yue: ['{action} 冇得 undo。', '{action} 冇得 undo。', '{action} 係冇得 undo 㗎。', '{action} 真係冇得 undo，一啲都冇。', '{action} 冇得 undo、冇備份、冇下次，亦都唔會有好心人救你。'],
  },
  'titlebar.wordmark': {
    en: ['Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow', 'Sprout Hollow'],
    yue: ['芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow', '芽谷 Sprout Hollow'],
  },
  'tabs.panel.empty': {
    en: ['{title} has nothing in it yet.', '{title} has nothing in it yet.', '{title} is empty for now.', '{title} is empty for now. Give it a moment.', '{title} is empty for now, and rather enjoying the peace.'],
    yue: ['{title} 入面暫時乜都冇。', '{title} 入面暫時乜都冇。', '{title} 暫時係空嘅。', '{title} 暫時係空嘅，等陣先啦。', '{title} 暫時係空嘅，仲幾享受呢份清靜。'],
  },
  'tabs.move.blocked': {
    en: ['{title} cannot move from there.', '{title} cannot move from there.', '{title} cannot move from there.', '{title} will not budge from there.', '{title} will not budge from there, and it has its reasons.'],
    yue: ['{title} 喺嗰度郁唔到。', '{title} 喺嗰度郁唔到。', '{title} 喺嗰度郁唔到喎。', '{title} 死都唔肯喺嗰度郁。', '{title} 死都唔肯喺嗰度郁，佢有佢嘅理由。'],
  },
  'surprise.panel.hint': {
    en: [
      'Every piece is drawn from code. Nothing is downloaded.',
      'Every piece is drawn from code. Nothing is downloaded.',
      'Every piece is drawn from code — nothing here was downloaded.',
      'Every piece is drawn from code. Nothing here was downloaded, or ever will be.',
      'Every piece is drawn from code, by hand. Nothing here was downloaded, or ever will be, not even the tea.',
    ],
    yue: [
      '每一件都係用 code 畫出嚟，冇下載過任何嘢。',
      '每一件都係用 code 畫出嚟，冇下載過任何嘢。',
      '每一件都係用 code 畫出嚟——呢度冇嘢係載返嚟嘅。',
      '每一件都係用 code 畫出嚟。呢度冇嘢係載返嚟，以後都唔會。',
      '每一件都係人手用 code 畫出嚟。呢度冇嘢係載返嚟，以後都唔會，連杯茶都唔會。',
    ],
  },
} as const

// ===========================================================================
// ALIASES — a second published name for a key that already exists above.
// One line each, and the two can never drift apart because they are the
// same object. Added because sibling lanes settled on their own key names.
// ===========================================================================

const ALIASES = {
  'settings.subtitle': CORE['settings.desc'],
  'settings.common.cancel': CORE['common.cancel'],
  'settings.common.on': CORE['common.on'],
  'settings.common.off': CORE['common.off'],
  'settings.language.mode': CORE['settings.lang.mode.label'],
  'settings.language.mode.desc': CORE['settings.lang.mode.desc'],
  'settings.motion.mode': CORE['settings.motion.label'],
  'settings.scale.level': CORE['settings.scale.label'],
  'settings.audio.mute': CORE['settings.audio.mute.label'],
  'settings.audio.test.action': CORE['settings.audio.test'],
  'settings.appearance.resetAll': CORE['appearance.resetAll'],
  'settings.data.export': CORE['settings.data.export.label'],
  'settings.data.import': CORE['settings.data.import.label'],
  'settings.data.clearHistory': CORE['history.clear'],
  'settings.data.resetAll': CORE['settings.data.reset.label'],
  'settings.data.resetAll.desc': CORE['settings.data.reset.desc'],
  'settings.data.resetAll.confirmTitle': CORE['settings.data.reset.confirm.title'],
  'settings.data.resetAll.confirmBody': CORE['settings.data.reset.confirm.body'],
  'settings.data.resetAll.done': CORE['settings.data.reset.done'],
  'settings.search.label': CORE['search.settings.label'],
  'settings.search.clear': CORE['search.clear'],
  'settings.search.focus': CORE['search.settings.label'],
  'settings.search.regexToggle': CORE['search.mode.regex'],
  'settings.search.literal': CORE['regex.piece.literal'],
  'settings.search.pattern': CORE['regex.pattern.label'],
  'settings.search.flags': CORE['regex.flags.label'],
  'settings.search.flag.i': CORE['regex.flag.i'],
  'settings.search.flag.m': CORE['regex.flag.m'],
  'settings.search.flag.s': CORE['regex.flag.s'],
  'settings.search.flag.u': CORE['regex.flag.u'],
  'settings.search.copy': CORE['regex.copy'],
  'settings.search.builderTitle': CORE['regex.title'],
  'settings.search.builderToggle': CORE['search.builder.open'],
  'settings.search.token.digit': CORE['regex.piece.digit'],
  'settings.search.token.word': CORE['regex.piece.word'],
  'settings.search.token.space': CORE['regex.piece.space'],
  'settings.search.token.any': CORE['regex.piece.any'],
  'settings.search.token.class': CORE['regex.piece.charclass'],
  'settings.search.token.start': CORE['regex.piece.anchor.start'],
  'settings.search.token.end': CORE['regex.piece.anchor.end'],
  'settings.search.token.wordBoundary': CORE['regex.piece.wordboundary'],
  'settings.search.token.group': CORE['regex.piece.capture'],
  'settings.search.token.alternate': CORE['regex.piece.alternation'],
  'settings.search.token.optional': CORE['regex.quantifier.optional'],
  'settings.search.token.oneOrMore': CORE['regex.quantifier.some'],
  'settings.search.token.anyCount': CORE['regex.quantifier.any'],
  'surprise.description': CORE['surprise.desc'],
  'settings.search': CORE['search.settings.label'],
  'titlebar.minimize': CORE['titlebar.minimise'],
  'titlebar.maximize': CORE['titlebar.maximise'],
} as const

/**
 * The whole catalogue: core entries, the lane-specific extras, and the aliases.
 * `satisfies` proves every entry has both languages at all five levels.
 */
export const STRINGS = { ...CORE, ...EXTRA, ...ALIASES } as const satisfies Record<
  string,
  StringEntry
>

/** Every key in the catalogue. Other lanes get a compile error for a typo. */
export type StringKey = keyof typeof STRINGS
