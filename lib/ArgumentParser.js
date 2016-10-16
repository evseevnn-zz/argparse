'use strict';

const _AttributeHolder  = require('./_AttributeHolder');
const _ActionsContainer = require('./_ActionsContainer');

/**
 * Object for parsing command line strings into JavaScript objects.
 */
class ArgumentParser extends _ActionsContainer
{
  /**
   * @param {String|Null}   prog                  The name of the program (default: process.argv[0])
   * @param {String|Null}   usage                 A usage message (default: auto-generated from arguments)
   * @param {String|Null}   description           A description of what the program does
   * @param {String|Null}   epilog                Text following the argument descriptions
   * @param {String|Null}   version
   * @param {Array}         parents               Parsers whose arguments should be copied into this one
   * @param {HelpFormatter} formatter_class       HelpFormatter class for printing help messages
   * @param {String}        prefix_chars          Characters that prefix optional arguments
   * @param {String}        fromfile_prefix_chars Characters that prefix files containing additional arguments
   * @param {String}        argument_default      The default value for all arguments
   * @param {Object}        conflict_handler      String indicating how to handle conflicts
   * @param {Boolean}       add_help              Add a -h/-help option
   */
  constructor({
    prog = null, usage = null, description = null,
    epilog = null, version = null, parents = [],
    formatter_class = '', prefix_chars = '-', fromfile_prefix_chars = null,
    argument_default = null, conflict_handler = 'error', add_help = true
    }) {
    super({ description, prefix_chars, argument_default, conflict_handler });

    this.prog = prog;
    this.usage = usage;
    this.epilog = epilog;
    this.version = version;
    this.parents = parents;
    this.formatter_class = formatter_class;
    this.fromfile_prefix_chars = fromfile_prefix_chars;
    this.add_help = add_help;
  }
}

module.exports = Object.defineProperties(ArgumentParser, _AttributeHolder);
