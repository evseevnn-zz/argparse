'use strict';

const { SUPPRESS } = require('./');

class _Section
{
  constructor(formatter, parent, heading = null) {
    this.formatter = formatter;
    this.parent = parent;
    this.heading = heading;
    this.items = new Map();
  }

  format_help() {
    // format the indented section
    if (!this.parent) {
      this.formatter._indent();
    }
    let join = this.formatter._join_parts;
    let item_help = join(Array.from(this.items).map(item => item[0].apply(this.formatter, ...item[1])));

    if (this.parent) {
      this.formatter._dedent();
    }

    // return nothing if the section was empty
    if (!item_help) {
      return '';
    }

    // add the heading if the section was non-empty
    let heading;
    if (this.heading && this.heading !== SUPPRESS) {
      let current_indent = this.formatter._current_indent;
      heading = `${current_indent}${this.heading}`;
    } else {
      heading = '';
    }

    // join the section-initial newline, the heading and the help
    return join([ '\n', heading, item_help, '\n' ]);
  }
}

module.exports = _Section;
