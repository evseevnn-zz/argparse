'use strict';

require('./helpers');

const fs                = require('fs');
const assert            = require('assert');
const _AttributeHolder  = require('./_AttributeHolder');
const _ActionsContainer = require('./_ActionsContainer');
const Namespace         = require('./Namespace');
const ArgumentError     = require('./errors/ArgumentError');
const {
  OPTIONAL,
  ONE_OR_MORE,
  SUPPRESS,
  _UNRECOGNIZED_ARGS_ATTR
  } = require('../lib');

/**
 * Object for parsing command line strings into JavaScript objects.
 *
 *
 * Keyword Arguments:
 * - prog                  -- The name of the program (default: process.argv[0])
 * - usage                 -- A usage message (default: auto-generated from arguments)
 * - description           -- A description of what the program does
 * - epilog                -- Text following the argument descriptions
 * - parents               -- Parsers whose arguments should be copied into this one
 * - formatter_class       -- HelpFormatter class for printing help messages
 * - prefix_chars          -- Characters that prefix optional arguments
 * - fromfile_prefix_chars -- Characters that prefix files containing additional arguments
 * - argument_default      -- The default value for all arguments
 * - conflict_handler      -- String indicating how to handle conflicts
 * - add_help              -- Add a -h/-help option
 */
class ArgumentParser extends _ActionsContainer
{
  /**
   * @param {String|Null}   prog                  The name of the program (default: process.argv[0])
   * @param {String|Null}   usage                 A usage message (default: auto-generated from arguments)
   * @param {String|Null}   description           A description of what the program does
   * @param {String|Null}   epilog                Text following the argument descriptions
   * @param {Array}         parents               Parsers whose arguments should be copied into this one
   * @param {HelpFormatter} formatter_class       HelpFormatter class for printing help messages
   * @param {String}        prefix_chars          Characters that prefix optional arguments
   * @param {String}        fromfile_prefix_chars Characters that prefix files containing additional arguments
   * @param {String}        argument_default      The default value for all arguments
   * @param {Object}        conflict_handler      String indicating how to handle conflicts
   * @param {Boolean}       add_help              Add a -h/-help option
   */
  constructor({
    prog   = null,
    usage = null,
    description = null,
    epilog = null,
    parents = [],
    formatter_class = new HelpFormatter(),
    prefix_chars = '-',
    fromfile_prefix_chars = null,
    argument_default = null,
    conflict_handler = 'error',
    add_help = true
    }) {
    super({ description, prefix_chars, argument_default, conflict_handler });

    if (!prog) {
      prog = process.argv[0];
    }

    this.prog                   = prog;
    this.usage                  = usage;
    this.epilog                 = epilog;
    this.parents                = parents;
    this.formatter_class        = formatter_class;
    this.fromfile_prefix_chars  = fromfile_prefix_chars;
    this.add_help               = add_help;

    this._positionals = this.add_argument_group('positional arguments');
    this._optionals   = this.add_argument_group('optional arguments');
    this._subparsers  = null;

    // register types
    this.register('type', null, string => string);

    // add help and version arguments if necessary
    // (using explicit default to override global argument_default)
    let default_prefix = prefix_chars[0];
    if (this.add_help) {
      this.add_argument(
        default_prefix + 'h', default_prefix.repeat(2) + 'help',
        {
          action: 'help', defaultValue: SUPPRESS,
          help: 'show this help message and exit'
        }
      );
    }

    // add parent arguments and defaults
    parents.forEach(parent => {
      this._add_container_actions(parent);
      if (parent._defaults) {
        this._defaults.update(parent._defaults);
      }
    });
  }

  /**
   * Optional/Positional adding methods
   */
  add_subparsers(...kwargs) {
    if (this._subparsers) {
      this.error('cannot have multiple subparser arguments');
    }

    // add the parser class to the arguments if it's not present
    if (!kwargs.parser_class) {
      kwargs.parser_class = this; // TODO: ??
    }

    if (kwargs.title || kwargs.description) {
      let title = kwargs.title || 'subcommands';
      let description = kwargs.description || null;
      delete kwargs.title;
      delete kwargs.description;
      this._subparsers = this.add_argument_group(title, description);
    } else {
      this._subparsers = this._positionals;
    }

    // prog defaults to the usage message of this parser, skipping
    // optional arguments and with no "usage:" prefix
    if (!kwargs.prog) {
      let formatter = this._get_formatter();
      let positionals = this._get_positional_actions();
      let groups = this._mutually_exclusive_groups;
      formatter.add_usage(this.usage, positionals, groups, '');
      kwargs.prog = formatter.format_help().trim();
    }

    // create the parsers action and add it to the positionals list
    let parsers_class = this._pop_action_class(kwargs, 'parsers');
    let action = parsers_class(Object.assign({ option_strings: [] }, kwargs));
    this._subparsers._add_action(action);

    // return the created parsers action
    return action;
  }

  /**
   * @param action
   * @returns {*}
   * @private
   */
  _add_action(action) {
    if (action.option_strings) {
      this._optionals._add_action(action);
    } else {
      this._positionals._add_action(action);
    }

    return action;
  }

  /**
   * Return optional actions
   *
   * @returns {Array.<T>}
   * @private
   */
  _get_optional_actions() {
    return this._actions.filter(action => action.option_strings);
  }

  /**
   * Return positional actions
   * @returns {Array.<T>}
   * @private
   */
  _get_positional_actions() {
    return this._actions.filter(action => !action.option_strings);
  }

  /**
   * Command line argument parsing methods
   * TODO: check this func
   * @param args
   * @param namespace
   * @returns {*}
   */
  parse_args(args = null, namespace = null) {
    let argv;
    [args, argv] = this.parse_known_args(args, namespace);
    if (argv) {
      this.error(`unrecognized arguments: ${argv.join(' ')}`);
    }

    return args;
  }

  /**
   *
   * @param args
   * @param namespace
   */
  parse_known_args(args = null, namespace = null) {
    if (!args || !args.length) {
      // args default to the system args
      args = process.argv.slice(1);
    }

    // default Namespace built from parser defaults
    if (!namespace) {
      namespace = new Namespace();
    }

    // add any action defaults that aren't present
    this._actions.forEach(action => {
      if (![ action.dest, action.default ].includes(SUPPRESS) && !namespace[action.dest]) {
        Object.defineProperty(namespace, action.dest, action.default);
      }
    });

    // add any parser defaults that aren't present
    this._defaults.forEach(dest => {
      // TODO: check defaults
      if (!namespace[dest]) {
        Object.defineProperty(namespace, dest, this._defaults[dest]);
      }
    });

    // parse the arguments and exit if there are any errors
    [ namespace, args ] = this._parse_known_args(args, namespace);
    if (namespace.hasOwnProperty(_UNRECOGNIZED_ARGS_ATTR)) {
      args.push(namespace[_UNRECOGNIZED_ARGS_ATTR]);
      delete namespace[_UNRECOGNIZED_ARGS_ATTR];
    }
    // TODO: On python here we can get error. in js also?
    return [ namespace, args ];
  }

  _parse_known_args(arg_strings, namespace) {
    // replace arg strings that are file references
    if (this.fromfile_prefix_chars) {
      arg_strings = this._read_args_from_files(arg_strings);
    }

    // map all mutually exclusive arguments to the other arguments
    // they can't occur with
    let action_conflicts = {};
    this._mutually_exclusive_groups.forEach(mutex_group => {
      mutex_group._group_actions.forEach(mutex_action => {
        if (!action_conflicts[mutex_action]) {
          action_conflicts[mutex_action] = [];
        }
      });
    });

    // find all option indices, and determine the arg_string_pattern
    // which has an 'O' if there is an option at an index,
    // an 'A' if there is an argument, or a '-' if there is a '--'
    let option_string_indices    = {};
    let arg_string_pattern_parts = [];
    arg_strings.forEach((arg_string, index) => {
      // all args after -- are non-options
      if (arg_string === '--') {
        arg_string_pattern_parts.push('-');
        arg_strings.forEach(arg_string => {
          arg_string_pattern_parts.push('A');
        });
      } else {
        // otherwise, add the arg to the arg strings
        // and note the index if it was an option
        let option_tuple = this._parse_optional(arg_string);
        let pattern;
        if (!option_tuple) {
          pattern = 'A';
        } else {
          option_string_indices[index] = option_tuple;
          pattern = 'O';
        }
        arg_string_pattern_parts.push(pattern);
      }
    });

    // join the pieces together to form the pattern
    let arg_strings_pattern = arg_string_pattern_parts.join();

    // converts arg strings to the appropriate and then takes the action
    let seen_actions = new Set();
    let seen_non_default_actions = new Set();

    let self = this;

    function take_action(action, argument_strings, option_string = null) {
      seen_actions.add(action);
      let argument_values = self._get_values(action, argument_strings);

      // error if this argument is not allowed with other previously
      // seen arguments, assuming that actions that use the default
      // value don't really count as "present"
      if (argument_values !== action.default) {
        seen_non_default_actions.add(action);
        action_conflicts.forEach(conflict_action => {
          if (seen_non_default_actions.has(conflict_action)) {
            let action_name = _get_action_name(conflict_action); // TODO: helpers!!!
            throw new ArgumentError(`not allowed with argument ${action_name}`);
          }
        });
      }

      // take the action if we didn't receive a SUPPRESS value
      // (e.g. from a default)
      if (argument_values !== SUPPRESS) {
        action(namespace, argument_values, option_string);
      }
    }

    // function to convert arg_strings into an optional action
    function consume_optional(start_index) {
      // get the optional identified at this index
      let option_tuple = option_string_indices[start_index];
      let {action, option_string, explicit_arg} = option_tuple;

      // identify additional optionals in the same arg string
      // (e.g. -xyz is the same as -x -y -z if no args are required)
      let match_argument = self._match_argument;
      let action_tuples = [];
      let stop;
      while (true) {
        // if we found no optional action, skip it
        if (!action) {
          extras.push(arg_strings[start_index]);
          return start_index + 1;
        }

        // if there is an explicit argument, try to match the
        // optional's string arguments to only this
        if (explicit_arg) {
          let arg_count = match_argument(action, 'A');

          // if the action is a single-dash option and takes no
          // arguments, try to parse more single-dash options out
          // of the tail of the option string
          let chars = self.prefix_chars;
          if (arg_count === 0 && !chars.includes(option_string[1])) {
            action_tuples.push([ action, [], option_string ]);
            let char = option_string[0];
            option_string = char + explicit_arg[0];
            let new_explicit_arg = explicit_arg.slice(1) || null;
            let optionals_map = self._option_string_actions;
            if (optionals_map[option_string]) {
              action = optionals_map[option_string];
              explicit_arg = new_explicit_arg;
            } else {
              throw new ArgumentError(`ignored explicit argument ${explicit_arg}`);
            }

          } else if (arg_count === 1) {
            // if the action expect exactly one argument, we've
            // successfully matched the option; exit the loop
            stop = start_index + 1;
            let args = [ explicit_arg ];
            action_tuples.push([ action, args, option_string ]);
            break;

          } else {
            // error if a double-dash option did not use the
            // explicit argument
            throw new ArgumentError(`ignored explicit argument ${explicit_arg}`);
          }
        } else {
          // if there is no explicit argument, try to match the
          // optional's string arguments with the following strings
          // if successful, exit the loop
          let start = start_index + 1;
          let selected_patterns = arg_strings_pattern.slice(start);
          let arg_count = match_argument(action, selected_patterns);
          stop = start + arg_count;
          let args = arg_strings.slice(start, stop);
          action_tuples.push([ action, args, option_string ]);
          break;
        }
      }

      // add the Optional to the list and return the index at which
      // the Optional's string args stopped
      assert(action_tuples);
      action_tuples.forEach(({action, args, option_string}) => {
        take_action(action, args, option_string);
      });

      return stop;
    }

    // the list of Positionals left to be parsed; this is modified
    // by consume_positionals()
    let positionals = this._get_positional_actions();

    // function to convert arg_strings into positional actions
    function consume_positionals(start_index) {
      // match as many Positionals as possible
      let match_partial = self._match_arguments_partial;
      let selected_pattern = arg_strings_pattern.slice(start_index);
      let arg_counts = match_partial(positionals, selected_pattern);

      // slice off the appropriate arg strings for each Positional
      // and add the Positional and its args to the list
      positionals.forEach((action, index) => {
        let stop_index = start_index += arg_counts[index];
        let args = arg_strings.slice(start_index, stop_index);
        start_index = stop_index;
        take_action(action, args);
      });

      // slice off the Positionals that we just parsed and return the
      // index at which the Positionals' string args stopped
      positionals = positionals.slice(arg_counts.length);
      return start_index;
    }

    // consume Positionals and Optionals alternately, until we have
    // passed the last option string
    let extras      = [];
    let start_index = 0;
    let max_option_string_index;
    if (option_string_indices) {
      max_option_string_index = Math.max(option_string_indices); // TODO: max for strings???
    } else {
      max_option_string_index = -1;
    }

    while (start_index <= max_option_string_index) {
      // consume any Positionals preceding the next option
      let next_option_string_index = Math.min(option_string_indices.filter((option_string, index) => {
        return index >= start_index;
      }));

      if (start_index !== next_option_string_index) {
        let positionals_end_index = consume_positionals(start_index);

        // only try to parse the next optional if we didn't consume
        // the option string during the positionals parsing
        if (positionals_end_index > start_index) {
          start_index = positionals_end_index;
          continue;
        } else {
          start_index = positionals_end_index;
        }
      }

      // if we consumed all the positionals we could and we're not
      // at the index of an option string, there were extra arguments
      if (!option_string_indices[start_index]) {
        let strings = arg_strings.slice(start_index, next_option_string_index);
        extras.push(strings);
        start_index = next_option_string_index;
      }

      // consume the next optional and any arguments for it
      start_index = consume_optional(start_index);
    }

    // consume any positionals following the last Optional
    let stop_index = consume_positionals(start_index);

    // if we didn't consume all the argument strings, there were extras
    extras.push(arg_strings.slice(stop_index));

    // if we didn't use all the Positional objects, there were too few
    // arg strings supplied.
    if (positionals) {
      this.error('too few arguments');
    }

    // make sure all required actions were present, and convert defaults.
    this._actions.forEach(action => {
      if (!seen_actions[action]) {
        if (action.required) {
          this.error(`argument ${_get_action_name(action)} is required`);
        } else if (
          action.default !== null &&
          action.default.constructor === String &&
          action.default === namespace[action.dest]
        ) {
          // Convert action default now instead of doing it before
          // parsing arguments to avoid calling convert functions
          // twice (which may fail) if the argument was given, but
          // only if it was defined already in the namespace
          Object.defineProperty(namespace, action.dest, this._get_value(action, action.default));
        }
      }
    });

    // make sure all required groups had one option present
    this._mutually_exclusive_groups.forEach(group => {
      if (group.required) {
        group._group_actions.forEach(action => {
          if (!seen_non_default_actions.has(action)) {
            // if no actions were used, report the error
            let names = group._group_actions
              .filter(action => action.help !== SUPPRESS)
              .map(action => _get_action_name(action));
            this.error(`one of the arguments ${names.join(' ')} is required`);
          }
        });
      }
    });

    // return the updated namespace and the extra arguments
    return [namespace, extras];
  }

  _read_args_from_files(arg_strings) {
    // expand arguments referencing files
    let new_arg_strings = [];

    arg_strings.forEach(arg_string => {
      // for regular arguments, just add them back into the list
      if (!arg_string || !this.fromfile_prefix_chars.includes(arg_string[0])) {
        new_arg_strings.push(arg_string);
      } else {
        // replace arguments referencing files with the file content
        arg_strings = [];
        fs
          .readFileSync(arg_string.slice(1))
          .split('\n')
          .map(arg_line => [arg_line])
          .forEach(line_args => {
            arg_strings.concat(line_args);
          });
        new_arg_strings.concat(this._read_args_from_files(arg_strings));
      }
    });

    // return the modified argument list
    return new_arg_strings;
  }

  /**
   *
   * @param action
   * @param arg_strings_pattern
   * @returns {*}
   * @private
   */
  _match_argument(action, arg_strings_pattern) {
    // match the pattern for this action to the arg strings
    let nargs_pattern = this._get_nargs_pattern(action);
    let match = new RegExp(nargs_pattern).exec(arg_strings_pattern);

    // raise an exception if we weren't able to find a match
    if (!match) {
      let nargs_errors = {};
      nargs_errors[null]        = 'expected one argument';
      nargs_errors[OPTIONAL]    = 'expected at most one argument';
      nargs_errors[ONE_OR_MORE] = 'expected at least one argument';

      let msg = nargs_errors[action.nargs] || `expected ${action.nargs} argument(s)`;
      throw new ArgumentError(action, msg); // TODO: check it
    }

    // return the number of arguments matched
    return match[1];
  }

  _match_arguments_partial(actions, arg_strings_pattern) {
    // progressively shorten the actions list by slicing off the
    // final actions until we find a match
    let result = [];

    for (let i = actions.length; i === 0; i--) {
      let actions_slice = actions.slice(0, i);
      let pattern = actions_slice.map(action => this._get_nargs_pattern(action)).join();
      let match = new RegExp(pattern).exec(arg_strings_pattern);
      if (match) {
        result.concat(match.map(string => string.length));
        break;
      }
    }

    // return the list of arg string counts
    return result;
  }

  _parse_optional(arg_string) {
    // if it's an empty string, it was meant to be a positional
    if (
      !arg_string ||
      // if it doesn't start with a prefix, it was meant to be positional
      !arg_string.startsWith(this.prefix_chars)
    ) {
      return null;
    }

    // if the option string is present in the parser, return the action
    if (this._option_string_actions[arg_string]) {
      let action = this._option_string_actions[arg_string];
      return [action, arg_string, null];
    }

    // if it's just a single character, it was meant to be positional
    if (arg_string.length == 1) {
      return null;
    }

    // if the option string before the "=" is present, return the action
    if ('=' in arg_string) {
      let [ option_string, explicit_arg ] = arg_string.split('=');
      if (this._option_string_actions[option_string]) {
        let action = this._option_string_actions[option_string];
        return [action, option_string, explicit_arg];
      }
    }

    // search through all possible prefixes of the option string
    // and all actions in the parser for possible interpretations
    let option_tuples = this._get_option_tuples(arg_string);

    // if multiple actions match, the option string was ambiguous
    if (option_tuples.length) {
      let options = option_tuples.map(([action, option_string, explicit_arg]) => option_string).join(', ');
      this.error(`ambiguous option: ${arg_string} could match ${options}`);
    } else if (option_tuples.length === 1) {
      // if exactly one action matched, this segmentation is good,
      // so return the parsed action
      return option_tuples.pop();
    }

    // if it was not found as an option, but it looks like a negative
    // number, it was meant to be positional
    // unless there are negative-number-like options
    if (this._negative_number_matcher.match(arg_string) && !this._has_negative_number_optionals) {
        return null;
    }

    // if it contains a space, it was meant to be a positional
    if (arg_string.contains(' ')) {
      return null;
    }

    // it was meant to be an optional but there is no such option
    // in this parser (though it might be a valid option in a subparser)
    return [null, arg_string, null];
  }

  _get_option_tuples(option_string) {
    let result = [];

    // option strings starting with two prefix characters are only
    // split at the '='
    let chars = this.prefix_chars;
    let option_prefix, explicit_arg;
    if (option_string.startsWith(chars.repeat(2))) {
      if (option_string.contains('=')) {
        [option_prefix, explicit_arg] = option_string.split('=');
      } else {
        option_prefix = option_string;
        explicit_arg  = null;
      }

      this._option_string_actions.forEach(option_string => {
        if (option_string.startsWith(option_prefix)) {
          let sction = this._option_string_actions[option_string];
          let tup    = [action, option_string, explicit_arg];
          result.push(tup);
        }
      });
    } else if (option_string.startsWith(chars)) {
      // single character options can be concatenated with their arguments
      // but multiple character options always have to have their argument
      // separate
      option_prefix = option_string;
      explicit_arg  = null;
      let short_option_prefix = option_string.slice(0, 1);
      let short_explicit_arg = option_string.slice(1);

      this._option_string_actions.forEach(option_string => {
        let action, tup;
        if (option_string === short_option_prefix) {
          action = this._option_string_actions[option_string];
          tup = [action, option_string, short_explicit_arg];
          result.push(tup);
        } else if (option_string.startsWith(option_prefix)) {
          action = this._option_string_actions[option_string];
          tup = [action, option_string, explicit_arg];
          result.push(tup);
        }
      });
    } else {
      // shouldn't ever get here
      this.error(`unexpected option string: ${option_string}`);
    }

    // return the collected option tuples
    return result;
  }

  _get_nargs_pattern(action) {
    // in all examples below, we have to allow for '--' args
    // which are represented as '-' in the pattern
    let nargs_pattern;

    switch (action.nargs) {
      // the default (None) is assumed to be a single argument
      case null:
        nargs_pattern = '(-*A-*)';
        break;

      // allow zero or one arguments
      case OPTIONAL:
        nargs_pattern = '(-*A?-*)';
        break;

      // allow zero or more arguments
      case ZERO_OR_MORE:
        nargs_pattern = '(-*[A-]*)';
        break;

      // allow one or more arguments
      case ONE_OR_MORE:
        nargs_pattern = '(-*A[A-]*)';
        break;

      // allow any number of options or arguments
      case REMAINDER:
        nargs_pattern = '([-AO]*)';
        break;

      // allow one argument followed by any number of options or arguments
      case PARSER:
        nargs_pattern = '(-*A[-AO]*)';
        break;

      // all others should be integers
      default:
        nargs_pattern = `(-*${'A'.repeat(action.nargs).split('').join('-*')}-*)`;
    }

    // if this is an optional action, -- is not allowed
    if (action.option_strings) {
      nargs_pattern = nargs_pattern
        .replace('-*', '')
        .replace('-', '');
    }

    // return the pattern
    return nargs_pattern;
  }

  // Value conversion methods
  _get_values(action, arg_strings) {
    // for everything but PARSER, REMAINDER args, strip out first '--'
    if ([PARSER, REMAINDER].includes(action.nargs)) {
      arg_strings = arg_strings.replace(/^(--)/, '');
    }

    // optional argument produces a default when not present
    let value;
    if (!arg_strings && action.nargs === OPTIONAL) {
      let value = action.option_strings ? action.const : action.default;

      if (value.constructor === String) {
        value = this._get_value(action, value);
        this._check_value(action, value);
      }

    } else if (!arg_strings && action.nargs == ZERO_OR_MORE && !action.option_strings) {
      // when nargs='*' on a positional, if there were no command-line
      // args, use the default if it is anything other than None
      value = action.default ? action.default : arg_strings;
      this._check_value(action, value);

    } else if (arg_strings.length == 1 && [null, OPTIONAL].includes(action.nargs)) {
      // single argument or optional argument produces a single value
      let arg_string = arg_strings.pop();
      value = this._get_value(action, arg_string);
      this._check_value(action, value);

    } else if (action.nargs == REMAINDER) {
      // REMAINDER arguments convert all values, checking none
      value = arg_strings.map(arg_string => this._get_value(action, arg_string));

    } else if (action.nargs == PARSER) {
      // PARSER arguments convert all values, but check only the first
      value = arg_strings.map(arg_string => this._get_value(action, arg_string));
      this._check_value(action, value[0]);

    } else {
      // all other types of nargs produce a list
      value = arg_strings.map(arg_string => this._get_value(action, arg_string));
      value.forEach(val => this._check_value(action, val));
    }

    // return the converted value
    return value;
  }

  _get_value(action, arg_string) {
    let type_func = this._registry_get('type', action.type, action.type);
    if (typeof type_func !== 'function') {
      throw new ArgumentError(`${type_func.name} is not callable`);
    }
    let result;
    // convert the value to the appropriate type
    try {
      result = type_func(arg_string);
    } catch ($e) {
      throw new ArgumentError(`invalid ${type_func.name} value: ${arg_string}`);
    }

    // return the converted value
    return result;
  }

  _check_value(action, value) {
    // converted value must be one of the choices (if specified)
    if (action.choices && !action.choices.includes(value)) {
      throw new ArgumentError(`invalid choice: ${value} (choose from ${action.choices.join(', ')})`);
    }
  }

  /**
   * Help-formatting methods
   */

  format_usage() {
    let formatter = this._get_formatter();
    formatter.add_usage(this.usage, this._actions, this._mutually_exclusive_groups);
    return formatter.format_help();
  }

  format_help() {
    let formatter = this._get_formatter();

    // usage
    formatter.add_usage(this.usage, this._actions, this._mutually_exclusive_groups);

    // description
    formatter.add_text(this.description);

    // positionals, optionals and user-defined groups
    this._action_groups.forEach(action_group => {
      formatter.start_section(action_group.title);
      formatter.add_text(action_group.description);
      formatter.add_arguments(action_group._group_actions);
      formatter.end_section();
    });

    // epilog
    formatter.add_text(this.epilog);

    // determine help from format above
    return formatter.format_help();
  }

  _get_formatter() {
    return this.formatter_class({prog: this.prog});
  }

  /**
   * Help-printing methods
   */

  print_usage(file = null, defaultStream = process.stdout) {
    let msg = this.format_usage();
    let stream = file ? fs.createWriteStream(file) : defaultStream;
    stream.pipe(msg);
  }

  print_help(file = null, defaultStream = process.stdout) {
    let msg = this.format_help();
    let stream = file ? fs.createWriteStream(file) : defaultStream;
    stream.pipe(msg);
  }

  _print_message(message, file = null) {
    if (message) {
      let stream = file ? fs.createWriteStream(file) : process.stderr;
      stream.pipe(message);
    }
  }

  exit(status = 0, message = null) {
    if (message) {
      this._print_message(message);
    }
    process.exit(status);
  }

  /**
   * error(message: string)
   *
   * Prints a usage message incorporating the message to stderr and
   * exits.
   *
   * If you override this in a subclass, it should not return -- it
   * should either exit or raise an exception.
   * @param {String} message
   */
  error(message) {
    this.print_usage(null, process.stderr);
    this.exit(2, `${this.prog}: error: ${message}\n`);
  }
}

module.exports = Object.defineProperties(ArgumentParser, _AttributeHolder);
