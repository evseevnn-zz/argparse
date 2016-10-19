'use strict';

const assert = require('assert');
const _Section = require('./_Section');
const {
  OPTIONAL,
  ONE_OR_MORE,
  SUPPRESS
  } = require('../lib');
/**
 * Formatter for generating usage messages and argument help strings.
 *
 * Only the name of this class is considered a public API. All the methods
 * provided by the class are considered an implementation detail.
 */
class HelpFormatter
{
  constructor({ prog, indent_increment = 2, max_help_position = 24, width = null }) {
    // default setting for width
    if (!width) {
      width = (process.env.COLUMNS || 80) - 2;
    }

    this._prog = prog;
    this._indent_increment = indent_increment;
    this._max_help_position = max_help_position;
    this._max_help_position = Math.min(max_help_position, Math.max(width - 20, indent_increment * 2));
    this._width = width;

    this._current_indent = 0;
    this._level = 0;
    this._action_max_length = 0;

    this._root_section = new _Section(this);
    this._current_section = this._root_section;

    this._whitespace_matcher = new RegExp('\s+');
    this._long_break_matcher = new RegExp('\n\n\n+');
  }

  _indent() {
    this._current_indent += this._indent_increment;
    this._level += 1;
  }

  _dedent() {
    this._current_indent -= this._indent_increment;
    assert(this._current_indent >= 0, 'Indent decreased below 0.');
    this._level -= 1;
  }

  _add_item(func, args) {
    this._current_section.items.set(func, args);
  }

  start_section(heading) {
    this._indent();
    let section = new _Section(this, this._current_section, heading);
    this._add_item(section.format_help, []);
    this._current_section = section;
  }

  end_section() {
    this._current_section = this._current_section.parent;
    this._dedent();
  }

  add_text(text) {
    if (text && text !== SUPPRESS) {
      this._add_item(this._format_text, [text]);
    }
  }

  add_usage(usage, actions, groups, prefix = null) {
    if (usage !== SUPPRESS) {
      this._add_item(this._format_usage, [ usage, actions, groups, prefix ]);
    }
  }

  add_argument(action) {
    if (action.help !== SUPPRESS) {
      // find all invocations
      let get_invocation = this._format_action_invocation;
      let invocations = [ get_invocation(action) ];
      this._iter_indented_subactions(action).forEach(subaction => {
        invocations.push(get_invocation(subaction));
      });

      // update the maximum item length
      let invocation_length = Math.max(...invocations.map(s => s.length));
      let action_length = invocation_length + this._current_indent;
      this._action_max_length = Math.max(this._action_max_length, action_length);

      // add the item to the list
      this._add_item(this._format_action, [ action ]);
    }
  }

  add_arguments(actions) {
    actions.map(action => this.add_argument(action));
  }

  format_help() {
    let help = this._root_section.format_help();
    if (help) {
      help = this._long_break_matcher.sub('\n\n', help);
      help = help.trim() + '\n';
    }

    return help;
  }

  /**
   *
   * @param {Array} part_strings
   * @private
   */
  _join_parts(part_strings) {
    part_strings.filter(part_string => part_string !== SUPPRESS).join('');
  }

  _format_usage(usage, actions, groups, prefix) {
    if (!prefix) {
      prefix = 'usage: ';
    }

    // if usage is specified, use that
    if (usage) {
      usage = usage.replace('%(prog)s', this._prog);
    } else if (!actions || !actions.length) {
      usage = this._prog;
    } else {
      let prog = this._prog;

      // split optionals from positionals
      let optionals   = [];
      let positionals = [];

      actions.forEach(action => {
        if (action.option_strings) {
          optionals.push(action);
        } else {
          positionals.push(action);
        }
      });

      // build full usage string
      let format = this._format_actions_usage;
      let action_usage = format(optionals + positionals, groups);
      usage = [ prog, action_usage ].filter(string => string).join(' ');

      // wrap the usage parts if it's too long
      let text_width = this._width - this._current_indent;
      if ((prefix.length + usage.length) > text_width) {
        // break usage into wrappable parts
        let part_regexp = new RegExp('\(.*?\)+|\[.*?\]+|\S+');
        let opt_usage   = format(optionals, groups);
        let pos_usage   = format(positionals, groups);
        let opt_parts   = part_regexp.exec(opt_usage);
        let pos_parts   = part_regexp.exec(pos_usage);
        assert(opt_parts.join(' '), opt_usage);
        assert(pos_parts.join(' '), pos_usage);

        // helper for wrapping lines
        function get_lines(parts, indent, prefix) {
          let lines = [];
          let line  = [];
          let line_len;

          if (prefix) {
            line_len = prefix.length - 1;
          } else {
            line_len = indent.length - 1;
          }

          parts.forEach(part => {
            if (line_len + 1 + part.length > text_width && line.length) {
              lines.push(indent + line.join(' '));
              line = [];
              line_len = indent.length - 1;
            }

            line.push(part);
            line_len += part.length + 1;
          });

          if (line.length) {
            lines.push(indent + line.join(' '));
          }

          if (prefix) {
            lines[0] = lines[0].slice(indent.length);
          }

          return lines;
        }

        let indent;
        let lines = [];
        // if prog is short, follow it with optionals or positionals
        if ((prefix.length + prog.length) <= 0.75 * text_width) {
          indent = ' '.repeat(prefix.length + prog.length + 1);
          if (opt_parts.length) {
            lines = get_lines([ prog ].concat(opt_parts), indent, prefix);
            lines.push(get_lines(pos_parts, indent));
          } else if (pos_parts) {
            lines = get_lines([ prog ].concat(pos_parts), indent, prefix);
          } else {
            lines = [ prog ];
          }
        } else {
          // if prog is long, put it on its own line
          indent = ' '.repeat(prefix.length);
          let parts = opt_parts.concat(pos_parts);
          lines = get_lines(parts, indent);
          if (lines.length > 1) {
            lines = []
            lines.concat(get_lines(opt_parts, indent));
            lines.concat(get_lines(pos_parts, indent));
          }

          lines = [ prog ].concat(lines);
        }

        // join lines into usage
        usage = lines.join('\n');
      }
    }

    // prefix with 'usage:'
    return `${prefix}${usage}\n\n`;
  }

  _format_actions_usage(actions, groups) {
    // find group indices and identify actions in groups
    let group_actions = new Set();
    let inserts = {};

    groups.forEach(group => {
      let start = actions.index.of(group._group_actions[0]);
      let end = start + group._group_actions.length;

      if (actions.slice(start, end) === group._group_actions) {
        group._group_actions.forEach(action => {
          group_actions.add(action);
        });

        if (!group.required) {
          if (inserts[start]) {
            inserts[start] += ' [';
          } else {
            inserts[start] = '[';
          }
        } else {
          if (inserts[start]) {
            inserts[start] += ' (';
          } else {
            inserts[start] = ')';
          }
        }

        for (let i = start + 1; i < end; i++) {
          inserts[i] = '|';
        }
      }
    });

    // collect all actions format strings
    let parts = [];
    let part;
    actions.forEach((action, index) => {
      // suppressed arguments are marked with None
      // remove | separators for suppressed arguments
      if (action.help === SUPPRESS) {
        parts.push(null);
        if (inserts[index] === '|') {
          inserts.splice(index, 1);
        } else if (inserts[index + 1] === '|') {
          inserts.splice(index + 1, 1);
        }
      } else if (!action.option_strings) {
        // produce all arg strings
        part = this._format_args(action, action.dest);

        // if it's in a group, strip the outer []
        if (action in group_actions) {
          if (part[0] === '[' && part[part.length - 1] === ']') {
            part = part.slice(1, part.length - 1);
          }
        }

        // add the action string to the list
        parts.push(part);
      } else {
        // produce the first way to invoke the option in brackets
        let option_string = action.option_strings[0];

        // if the Optional doesn't take a value, format is:
        //  -s or --long
        if (action.nargs === 0) {
          part = option_string;
        } else {
          // if the Optional takes a value, format is:
          //    -s ARGS or --long ARGS
          let defaultValue = action.dest.toUpperCase();
          let args_string = this._format_args(action, defaultValue);
          part = `${option_string} ${args_string}`;
        }

        // make it look optional if it's not required or in a group
        if (!action.required && !group_actions.includes(action)) {
          part = `[${part}]`;
        }

        // add the action string to the list
        parts.push(part);
      }
    });

    // insert things at the necessary indices
    inserts.sort().reverse().forEach((insert, index) => {
      parts.fill([ inserts[index] ], index, index); // TODO: So strange!
    });

    // join all the action items with spaces
    let text = parts.filter(item => item).join(' ');

    // clean up separators for mutually exclusive groups
    let open = '[\[(]';
    let close = '[\])]';

    let regExpResult = new RegExp(`(${open}) `).exec(text);
    text = regExpResult ? regExpResult[1] : regExpResult;

    regExpResult = new RegExp(` (${close})`).exec(text);
    text = regExpResult ? regExpResult[1] : regExpResult;

    regExpResult = new RegExp(`${open}\s*${close}`).exec(text);
    text = regExpResult ? regExpResult[0] : regExpResult;

    regExpResult = new RegExp('\(([^|]*)\)').exec(text);
    text = regExpResult ? regExpResult[1] : regExpResult;

    return text.trim();
  }

  _format_text(text) {
    text = text.replace('%(prog)', this._prog);
    let text_width = Math.max(this._width - this._current_indent, 11);
    let indent = ' '.repeat(this._current_indent);

    return this._fill_text(text, text_width, indent) + '\n\n';
  }

  _format_action(action) {
    // determine the required width and the entry label
    let help_position = Math.min(this._action_max_length + 2, this._max_help_position);
    let help_width = Math.max(this._width - help_position, 11);
    let action_width = help_position - this._current_indent - 2;
    let action_header = this._format_action_invocation(action);

    // no help; start on same line and add a final newline
    let indent_first;
    if (!action.help) {
      action_header = `${' '.repeat(this._current_indent)}${action_header}`;
    } else if (action_header.length <= action_width) {
      // short action name; start on the same line and pad two spaces
      action_header = `${' '.repeat(this._current_indent)}${'-'.repeat(action_width)}${action_header} `;
      // TODO: CHECK! '%*s%-*s  '
      indent_first = 0;
    } else {
      // long action name; start on the next line
      action_header = `${' '.repeat(this._current_indent)}${action_header}\n`;
      indent_first = help_position;
    }

    // collect the pieces of the action help
    let parts = [ action_header ];

    // if there was help for the action, add lines of help text
    if (action.help) {
      let help_text = this._expand_help(action);
      let help_lines = this._split_lines(help_text, help_width);
      parts.push(`${' '.repeat(indent_first)}${help_lines[0]}`);

      help_lines.slice(1).forEach(line => parts.push(`${help_position}${line}`));
    } else if (!action_header.endsWith('\n')) {
      // or add a newline if the description doesn't end with one
      parts.push('\n');
    }

    // if there are any sub-actions, add their help as well
    this._iter_indented_subactions(action)
      .forEach(subaction => parts.push(this._format_action(subaction)));

    // return a single string
    return this._join_parts(parts);
  }

  _format_action_invocation(action) {
    if (!action.option_strings) {
      let [metavar, ] = this._metavar_formatter(action, action.dest)(1);
      return this._metavar_formatter(action, action.dest)(1);
    } else {
      let parts = [];

      // if the Optional doesn't take a value, format is:
      //    -s, --long
      if (action.nargs == 0) {
        parts.concat(action.option_strings);
      } else {
        // if the Optional takes a value, format is:
        //    -s ARGS, --long ARGS
        let defaultValue = action.dest.toUpperCase();
        let args_string = this._format_args(action, defaultValue);
        action.option_strings.forEach(option_string => parts.push(`${option_string} ${args_string}`));
      }

      return parts.join(', ');
    }
  }

  /**
   *
   * @param action
   * @param default_metavar
   * @returns {Function}
   * @private
   */
  _metavar_formatter(action, default_metavar) {
    let result;
    if (action.metavar) {
      result = action.metavar;
    } else if (action.choices) {
      result = `{${action.choices.join(',')}}`;
    } else {
      result = default_metavar;
    }

    return result;
  }

  _format_args(action, default_metavar) {
    let metavar = this._metavar_formatter(action, default_metavar);
    switch (action.nargs) {
      case null:
        return metavar;

      case OPTIONAL:
        return `[${metavar}]`;

      case ZERO_OR_MORE:
        return `[${metavar} [${metavar} ...]]`;

      case ONE_OR_MORE:
        return `${metavar} [${metavar} ...]`;

      case REMAINDER:
        return '...';

      case PARSER:
        return `${metavar} ...`;

      default:
        return `${metavar} `.repeat(action.nargs).trim();
    }
  }

  _expand_help(action) {
    let params = Object
      .assign({}, action, {prog: this._prog})
      .filter(param => param !== SUPPRESS);
    // here not like in python... may be this make problem in the future

    if (params.choices.length) {
      params['choices'] = params.choices.join(', ');
    }

    return this._get_help_string(action); // TODO: need put params to string what comeback
  }

  *_iter_indented_subactions(action) {
    let get_subactions = action._get_subactions;
    if (typeof get_subactions === 'function') {
      this._indent();
      for (let subaction in get_subactions()) {
        yield subaction;
      }
      this._dedent();
    }
  }

  _split_lines(text, width) {
    text.replace('\n', ' ').trim();
    return _textwrap.wrap(text, width);
  }

  _fill_text(text, width, indent) {
    text.replace('\n', ' ').trim();
    return _textwrap.fill(text, width, {initial_indent: indent, subsequent_indent: indent});
  }

  _get_help_string(action) {
    return action.help;
  }
}

module.exports = HelpFormatter;
