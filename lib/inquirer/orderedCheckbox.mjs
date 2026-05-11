import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useMemo,
  makeTheme,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isEnterKey,
  Separator,
} from '@inquirer/core';

const cursorHide = '\x1B[?25l';

/** @param {unknown} item */
function isNavigable(item) {
  return !Separator.isSeparator(item);
}

/**
 * @template Value
 * @param {(Choice<Value>|Value|Separator)[]} choices
 * @returns {(Required<Choice<Value>>|Separator)[]}
 */
function normalizeChoices(choices) {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;
    if (typeof choice !== 'object' || choice === null || !('value' in choice)) {
      const name = String(choice);
      return { value: choice, name, short: name, disabled: false };
    }
    const name = choice.name ?? String(choice.value);
    return {
      value: choice.value,
      name,
      short: choice.short ?? name,
      disabled: choice.disabled ?? false,
    };
  });
}

/**
 * @template Value
 * @typedef {Object} Choice
 * @property {Value} value
 * @property {string} [name]
 * @property {string} [short]
 * @property {string|boolean} [disabled]
 */

/**
 * @template Value
 * @typedef {Object} OrderedCheckboxConfig
 * @property {string} message
 * @property {Array<Choice<Value> | Value | Separator>} choices
 * @property {number} [pageSize]
 * @property {boolean} [loop]
 * @property {boolean} [required]
 * @property {any} [theme]
 * @property {string[]} [default]
 */

/**
 *
 * @template T
 * @param {T|Separator} x
 * @returns {x is T}
 */
const isNotSeparator = (x) => !Separator.isSeparator(x);

/**
 * @template Value
 * @param {string[]} values
 * @param {Array<Separator|Choice<Value>>} items
 */
const mapPreselectToItems = (values, items) => {
  const itemsWithoutSeparators = items.filter(isNotSeparator);
  /** @type {Value[]} */
  const result = [];
  values.forEach((v) => {
    const choice = itemsWithoutSeparators.find((i) => i.value === v);
    if (choice) result.push(choice.value);
  });
  return result;
};

/** @type {<const Value>(config: OrderedCheckboxConfig<Value>) => Promise<Value[]>} */
const orderedCheckbox = createPrompt((config, done) => {
  const { pageSize = 7, loop = true } = config;
  const theme = makeTheme(config.theme ?? {});
  const [status, setStatus] = useState(
    /** @type {import('@inquirer/core').Status} */ ('idle'),
  );
  const prefix = usePrefix({ status, theme });
  const [items] = useState(() => normalizeChoices(config.choices));

  // ordered array of selected values; index+1 is the displayed ordinal
  const [selections, setSelections] = useState(() =>
    mapPreselectToItems(config.default ?? [], items),
  );

  const bounds = useMemo(() => {
    const first = items.findIndex(isNavigable);
    const last = items.findLastIndex(isNavigable);
    return { first, last };
  }, [items]);

  const [active, setActive] = useState(bounds.first);
  const [errorMsg, setError] = useState(
    /** @type {string | undefined} */ (undefined),
  );

  useKeypress(async (key) => {
    if (isEnterKey(key)) {
      if (config.required && selections.length === 0) {
        setError('At least one choice must be selected');
        return;
      }
      setStatus('done');
      done(/** @type {any} */ (selections));
    } else if (isUpKey(key) || isDownKey(key)) {
      if (errorMsg) setError(undefined);
      if (
        loop ||
        (isUpKey(key) && active !== bounds.first) ||
        (isDownKey(key) && active !== bounds.last)
      ) {
        const offset = isUpKey(key) ? -1 : 1;
        let next = active;
        do {
          next = (next + offset + items.length) % items.length;
        } while (!isNavigable(items[next]));
        setActive(next);
      }
    } else if (isSpaceKey(key)) {
      const activeItem = items[active];
      if (!activeItem || Separator.isSeparator(activeItem)) return;
      if (activeItem.disabled) {
        setError('This option is disabled and cannot be toggled.');
        return;
      }
      setError(undefined);
      const { value } = activeItem;
      if (selections.includes(value)) {
        setSelections(selections.filter((v) => v !== value));
      } else {
        setSelections([...selections, value]);
      }
    }
  });

  const message = theme.style.message(config.message, status);

  if (status === 'done') {
    const selectedItems = selections
      .map((v) => items.find((i) => !Separator.isSeparator(i) && i.value === v))
      .filter(Boolean);
    const answer = theme.style.answer(
      selectedItems.map((i) => /** @type {any} */ (i).short).join(', '),
    );
    return [prefix, message, answer].filter(Boolean).join(' ');
  }

  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;

      const cursor = isActive ? theme.style.highlight('>') : ' ';
      const ordinal = selections.indexOf(item.value);
      const badge = ordinal >= 0 ? `[${ordinal + 1}]` : '[ ]';
      const coloredBadge = ordinal >= 0 ? theme.style.highlight(badge) : badge;

      if (item.disabled) {
        const label =
          typeof item.disabled === 'string' ? item.disabled : '(disabled)';
        return `${cursor}${badge} ${item.name} ${label}`;
      }

      const color = isActive
        ? theme.style.highlight
        : (/** @type {string} */ x) => x;
      return `${cursor}${coloredBadge} ${color(item.name)}`;
    },
    pageSize,
    loop,
  });

  const helpLine = `(↑↓ navigate • space select • ⏎ submit)`;

  return (
    [
      `${prefix} ${message}`,
      page,
      errorMsg ? theme.style.error(errorMsg) : '',
      helpLine,
    ]
      .filter(Boolean)
      .join('\n')
      .trimEnd() + cursorHide
  );
});

export default orderedCheckbox;
export { Separator } from '@inquirer/core';
