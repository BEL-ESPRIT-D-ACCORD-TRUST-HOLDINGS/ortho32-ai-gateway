ORTPROV ; Provider invocation dispatch
 ; Request data never reaches a shell command line: the body and the credential header go
 ; through 0600 files (curl -K / --data-binary @file); the only values on the command line are
 ; constant strings and file names built from a validated request id.
 ;
CALL(ID,PROVIDER,PROMPT) ;
 IF ID'?1.64(1AN,1"-",1"_") SET ^ORTHO("REQ",ID,"ERROR")="invalid request id" QUIT 1
 IF PROVIDER="openai" QUIT $$OPENAI(ID,PROMPT)
 IF PROVIDER="anthropic" QUIT $$ANTH(ID,PROMPT)
 SET ^ORTHO("REQ",ID,"ERROR")="unsupported provider: "_PROVIDER
 QUIT 1
 ;
OPENAI(ID,PROMPT) ;
 NEW KEY,MODEL,BODY,URL
 SET KEY=$$KEY^ORTVAULT("openai")
 IF KEY="" SET ^ORTHO("REQ",ID,"ERROR")="OPENAI_API_KEY missing" QUIT 1
 IF KEY'?1.200(1AN,1".",1"_",1"-") SET ^ORTHO("REQ",ID,"ERROR")="OPENAI_API_KEY malformed" QUIT 1
 SET MODEL=$$REMOTE^ORTROUTE($GET(^ORTHO("REQ",ID,"MODEL")))
 IF MODEL="" SET MODEL="gpt-4o-mini"
 DO EVENT^ORTSTREAM(ID,"provider","openai")
 SET BODY="{""model"":"""_$$ESC^ORTIPC(MODEL)_""",""messages"":[{""role"":""user"",""content"":"""_$$ESC^ORTIPC(PROMPT)_"""}],""stream"":false}"
 SET URL=$ZTRNLNM("ORTHO_OPENAI_URL")
 IF URL="" SET URL="https://api.openai.com/v1/chat/completions"
 QUIT $$RUN(ID,"curl -sS -f "_URL,"header = ""Authorization: Bearer "_KEY_"""",BODY)
 ;
ANTH(ID,PROMPT) ;
 NEW KEY,MODEL,BODY,URL
 SET KEY=$$KEY^ORTVAULT("anthropic")
 IF KEY="" SET ^ORTHO("REQ",ID,"ERROR")="ANTHROPIC_API_KEY missing" QUIT 1
 IF KEY'?1.200(1AN,1".",1"_",1"-") SET ^ORTHO("REQ",ID,"ERROR")="ANTHROPIC_API_KEY malformed" QUIT 1
 SET MODEL=$$REMOTE^ORTROUTE($GET(^ORTHO("REQ",ID,"MODEL")))
 IF MODEL="" SET MODEL="claude-3-5-sonnet-20241022"
 DO EVENT^ORTSTREAM(ID,"provider","anthropic")
 SET BODY="{""model"":"""_$$ESC^ORTIPC(MODEL)_""",""max_tokens"":256,""messages"":[{""role"":""user"",""content"":"""_$$ESC^ORTIPC(PROMPT)_"""}],""stream"":false}"
 SET URL=$ZTRNLNM("ORTHO_ANTHROPIC_URL")
 IF URL="" SET URL="https://api.anthropic.com/v1/messages"
 QUIT $$RUN(ID,"curl -sS -f "_URL,"header = ""x-api-key: "_KEY_""""_$CHAR(10)_"header = ""anthropic-version: 2023-06-01""",BODY)
 ;
RUN(ID,CMD,CFG,BODY) ;
 NEW DIR,BASE,FB,FC,FR,FT,RC,TEXT,NL
 SET NL=$CHAR(10)
 SET DIR=$ZTRNLNM("ORTHO_TMP")
 IF DIR="" SET DIR="/tmp"
 SET BASE=DIR_"/ortho-"_ID_"-"_$JOB
 SET FB=BASE_".body",FC=BASE_".cfg",FR=BASE_".resp",FT=BASE_".text"
 DO PUT(FB,BODY)
 DO PUT(FC,CFG_NL_"header = ""Content-Type: application/json"""_NL_"data-binary = ""@"_FB_""""_NL_"max-time = 120"_NL_"output = """_FR_"""")
 SET ^ORTHO("REQ",ID,"STATE")="STREAMING"
 DO EVENT^ORTSTREAM(ID,"state","STREAMING")
 SET RC=$$SH(CMD_" -K "_FC)
 IF RC'=0 DO CLEAN(BASE) SET ^ORTHO("REQ",ID,"ERROR")="provider transport failed rc="_RC QUIT 1
 ; Reply text as a JSON string literal produced by jq (no raw control characters reach M).
 ; Falls back to the whole response body if the expected fields are absent.
 SET RC=$$SH("jq -j '(.choices[0].message.content // .content[0].text // empty) | @json' "_FR_" > "_FT)
 SET TEXT=$$GET(FT)
 IF (RC'=0)!(TEXT="") SET RC=$$SH("jq -Rs . "_FR_" > "_FT) SET TEXT=$$GET(FT)
 IF TEXT="" SET TEXT=""""""
 DO CLEAN(BASE)
 DO EVENT^ORTSTREAM(ID,"tokenj",TEXT)
 QUIT 0
 ;
PUT(F,X) ;
 NEW RC
 SET RC=$$SH("umask 077; : > "_F)
 OPEN F:(APPEND:STREAM:NOWRAP:CHSET="M")
 USE F
 WRITE X
 CLOSE F
 USE $PRINCIPAL
 QUIT
 ;
GET(F) ;
 NEW OUT,X
 IF $ZSEARCH(F,0)="" QUIT ""
 SET OUT=""
 OPEN F:(READONLY:STREAM:NOWRAP:CHSET="M")
 USE F
 FOR  READ X#4096 SET OUT=OUT_X QUIT:$ZEOF
 CLOSE F
 USE $PRINCIPAL
 QUIT OUT
 ;
CLEAN(BASE) ;
 NEW RC
 SET RC=$$SH("rm -f "_BASE_".body "_BASE_".cfg "_BASE_".resp "_BASE_".text")
 QUIT
SH(CMD) ;
 ; The $ZF spawn form returns 0 without running anything on YottaDB r2.06; ZSYSTEM runs the command and sets $ZSYSTEM.
 ZSYSTEM CMD
 QUIT $ZSYSTEM
