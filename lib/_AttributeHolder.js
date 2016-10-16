'use strict';

/**
 * Abstract base class that provides __repr__.
 * The __repr__ method returns a string in the format::
 * ClassName(attr=name, attr=name, ...)
 * The attributes are determined either by a class-level attribute,
 * '_kwarg_names', or by inspecting the instance __dict__.
 */
class _AttributeHolder
{

}


module.exports = _AttributeHolder;
