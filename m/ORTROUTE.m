ORTROUTE ; Alias and deterministic provider routing
 ;
INIT ;
 KILL ^ORTHO("MODEL"),^ORTHO("ROUTE")
 DO MODEL("anthropic:claude-3-5-sonnet-20241022","anthropic","claude-3-5-sonnet-20241022","active")
 DO MODEL("openai:gpt-4o-mini","openai","gpt-4o-mini","active")
 DO MODEL("openai:gpt-4o-2024-08-06","openai","gpt-4o-2024-08-06","active")
 DO ALIAS("coding.default","anthropic:claude-3-5-sonnet-20241022")
 DO ALIAS("fast.default","openai:gpt-4o-mini")
 DO ALIAS("reasoning.deep","openai:gpt-4o-2024-08-06")
 QUIT
 ;
MODEL(ID,PROVIDER,REMOTE,STATE) ;
 SET ^ORTHO("MODEL",ID,"PROVIDER")=PROVIDER
 SET ^ORTHO("MODEL",ID,"REMOTE")=REMOTE
 SET ^ORTHO("MODEL",ID,"STATE")=$GET(STATE,"active")
 QUIT
 ;
ALIAS(NAME,CANON) ;
 SET ^ORTHO("ROUTE",NAME)=CANON
 QUIT
 ;
RESOLVE(REF) ;
 NEW CANON,PROVIDER
 SET CANON=$GET(^ORTHO("ROUTE",REF),REF)
 SET PROVIDER=$GET(^ORTHO("MODEL",CANON,"PROVIDER"))
 IF PROVIDER="" QUIT ""
 QUIT PROVIDER
 ;
REMOTE(REF) ;
 NEW CANON
 SET CANON=$GET(^ORTHO("ROUTE",REF),REF)
 QUIT $GET(^ORTHO("MODEL",CANON,"REMOTE"))
 ;
CANON(REF) ;
 QUIT $GET(^ORTHO("ROUTE",REF),REF)

