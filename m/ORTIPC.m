ORTIPC ; ORTHOHost IPC boundary
 ;
SEND(ID,SEQ) ;
 NEW TYPE,VALUE
 SET TYPE=$GET(^ORTHO("EVENT",ID,SEQ,"TYPE"))
 SET VALUE=$GET(^ORTHO("EVENT",ID,SEQ,"VALUE"))
 WRITE "{""requestId"":"""_ID_""",""seq"":"_SEQ_",""type"":"""_TYPE_""",""value"":"""_$$ESC(VALUE)_"""}",!
 QUIT 1
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

