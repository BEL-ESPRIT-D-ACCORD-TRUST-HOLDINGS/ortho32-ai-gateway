ORTPROV ; Provider invocation dispatch
 ;
CALL(ID,PROVIDER,PROMPT) ;
 IF PROVIDER="openai" QUIT $$OPENAI(ID,PROMPT)
 IF PROVIDER="anthropic" QUIT $$ANTH(ID,PROMPT)
 SET ^ORTHO("REQ",ID,"ERROR")="unsupported provider: "_PROVIDER
 QUIT 1
 ;
OPENAI(ID,PROMPT) ;
 NEW KEY,MODEL,BODY,CMD,RC
 SET KEY=$$KEY^ORTVAULT("openai")
 IF KEY="" SET ^ORTHO("REQ",ID,"ERROR")="OPENAI_API_KEY missing" QUIT 1
 SET MODEL=$GET(^ORTHO("REQ",ID,"MODEL"))
 SET MODEL=$$REMOTE^ORTROUTE(MODEL)
 IF MODEL="" SET MODEL="gpt-4o-mini"
 DO EVENT^ORTSTREAM(ID,"provider","openai")
 SET BODY="{""model"":"""_MODEL_""",""messages"":[{""role"":""user"",""content"":"""_$$ESC(PROMPT)_"""}],""stream"":false}"
 SET CMD="curl -sS -f https://api.openai.com/v1/chat/completions -H ""Authorization: Bearer "_KEY_""" -H ""Content-Type: application/json"" -d '"_BODY_"'"
 SET RC=$$RUN(ID,CMD)
 QUIT RC
 ;
ANTH(ID,PROMPT) ;
 NEW KEY,MODEL,BODY,CMD,RC
 SET KEY=$$KEY^ORTVAULT("anthropic")
 IF KEY="" SET ^ORTHO("REQ",ID,"ERROR")="ANTHROPIC_API_KEY missing" QUIT 1
 SET MODEL=$GET(^ORTHO("REQ",ID,"MODEL"))
 SET MODEL=$$REMOTE^ORTROUTE(MODEL)
 IF MODEL="" SET MODEL="claude-3-5-sonnet-20241022"
 DO EVENT^ORTSTREAM(ID,"provider","anthropic")
 SET BODY="{""model"":"""_MODEL_""",""max_tokens"":256,""messages"":[{""role"":""user"",""content"":"""_$$ESC(PROMPT)_"""}],""stream"":false}"
 SET CMD="curl -sS -f https://api.anthropic.com/v1/messages -H ""x-api-key: "_KEY_""" -H ""anthropic-version: 2023-06-01"" -H ""Content-Type: application/json"" -d '"_BODY_"'"
 SET RC=$$RUN(ID,CMD)
 QUIT RC
 ;
RUN(ID,CMD) ;
 NEW RC
 SET ^ORTHO("REQ",ID,"STATE")="STREAMING"
 DO EVENT^ORTSTREAM(ID,"state","STREAMING")
 SET RC=$ZF(-1,CMD)
 IF RC'=0 SET ^ORTHO("REQ",ID,"ERROR")="provider transport failed rc="_RC QUIT 1
 DO TOKEN^ORTSTREAM(ID,"provider response received")
 QUIT 0
 ;
ESC(X) ;
 NEW Y,I,C
 SET Y=""
 FOR I=1:1:$LENGTH(X) DO
 . SET C=$EXTRACT(X,I)
 . IF C="""" SET Y=Y_"\\""" QUIT
 . IF C="\" SET Y=Y_"\\\\" QUIT
 . SET Y=Y_C
 QUIT Y

