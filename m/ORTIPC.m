ORTIPC ; ORTHOHost IPC boundary: one InferenceEvent JSON line per event on stdout
 ;
SEND(ID,SEQ) ;
 NEW TYPE,VALUE
 SET TYPE=$GET(^ORTHO("EVENT",ID,SEQ,"TYPE"))
 SET VALUE=$GET(^ORTHO("EVENT",ID,SEQ,"VALUE"))
 IF TYPE="token" DO LINE(ID,VALUE,0,"",0) QUIT
 IF TYPE="tokenj" DO LINE(ID,VALUE,0,"",1) QUIT
 IF TYPE="failed" DO LINE(ID,"",1,VALUE,0) QUIT
 IF TYPE="state",(VALUE="DONE")!(VALUE="CANCELLED") DO LINE(ID,"",1,"",0) QUIT
 QUIT
 ;
ERR(ID,MSG) ;
 DO LINE(ID,"",1,MSG,0)
 QUIT
 ;
LINE(ID,CHUNK,DONE,ERR,PRE) ; PRE=1: CHUNK is already a JSON string literal (quotes included)
 NEW OUT
 SET OUT="{""CorrelationId"":"""_$$ESC(ID)_""",""Chunk"":"_$SELECT(PRE:CHUNK,1:""""_$$ESC(CHUNK)_"""")_",""Done"":"_$SELECT(DONE:"true",1:"false")
 SET OUT=OUT_",""Model"":"""_$$ESC($GET(^ORTHO("REQ",ID,"MODEL")))_""",""Tokens"":0"
 IF ERR'="" SET OUT=OUT_",""Error"":"""_$$ESC(ERR)_""""
 SET OUT=OUT_"}"
 IF DONE,ID'="" SET ^ORTHO("REQ",ID,"DONE")=1
 WRITE OUT,!
 QUIT
 ;
ESC(X) ;
 NEW Y,I,C,N
 SET Y=""
 FOR I=1:1:$LENGTH(X) DO
 . SET C=$EXTRACT(X,I),N=$ASCII(C)
 . IF C="""" SET Y=Y_"\""" QUIT
 . IF C="\" SET Y=Y_"\\" QUIT
 . IF N=10 SET Y=Y_"\n" QUIT
 . IF N=13 SET Y=Y_"\r" QUIT
 . IF N=9 SET Y=Y_"\t" QUIT
 . IF N<32 SET Y=Y_"\u00"_$EXTRACT("0123456789abcdef",N\16+1)_$EXTRACT("0123456789abcdef",N#16+1) QUIT
 . SET Y=Y_C
 QUIT Y
