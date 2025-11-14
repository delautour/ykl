NEWLINE ::= \r?\n(\w*)
SECTION_START ::= NEWLINE '---'
ASSIGNMENT ::= :
EMPTY = {}

Expression :== TODO


Assignment ::= ATOM ASSIGNMENT Expression

Section :== Assignment | Expression | 