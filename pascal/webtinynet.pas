unit WebTinyNet;
{$mode objfpc}
interface
uses JS;
type
  TTable = class
    Rows, Cols: NativeInt;
    Scale: TJSFloat32Array;
    W: TJSInt8Array;
  end;
  TLayer = class
    G1,G2,KS,VS: TJSFloat32Array;
    WQ,WK,WV,WO,F1,F2: TTable;
    KC,VC: TJSInt8Array;
  end;
  TTiny = class
  private
    View: TJSDataView;
    Offset, HD: NativeInt;
    Divisor: Double;
    Emb,Pos: TTable;
    Layers: array of TLayer;
    GF,X,BH,Q,T,A,M,S: TJSFloat32Array;
    procedure Need(N: NativeInt);
    function Read16: NativeInt;
    function ReadFloat: Double;
    function Gains: TJSFloat32Array;
    function Table(Rows,Cols: NativeInt): TTable;
    procedure Mat(TB: TTable; Input,Output: TJSFloat32Array);
    procedure Norm(Input,Gain,Output: TJSFloat32Array);
    function Store(Dest: TJSInt8Array; P: NativeInt; Input: TJSFloat32Array): Double;
  public
    D,L,H,HID: NativeInt;
    Score,Activity: TJSFloat32Array;
    Confidence: Double;
    constructor FromBuffer(Buffer: TJSArrayBuffer);
    procedure Step(Tok,P: NativeInt);
    function Pick(Creativity: NativeInt): NativeInt;
  end;
implementation
function F(Value: Double): Double; external name 'Math.fround';
procedure TTiny.Need(N: NativeInt);
begin if Offset+N>View.byteLength then raise TJSError.new('TINY.BIN is too short or damaged.'); end;
function TTiny.Read16: NativeInt;
begin Need(2);Result:=View.getUint16(Offset,true);Inc(Offset,2);end;
function TTiny.ReadFloat: Double;
begin Need(4);Result:=View.getFloat32(Offset,true);Inc(Offset,4);if not TJSNumber.isFinite(Result) then raise TJSError.new('Invalid model weight.');end;
function TTiny.Gains: TJSFloat32Array;
var I: NativeInt;
begin Result:=TJSFloat32Array.new(D);for I:=0 to D-1 do Result[I]:=ReadFloat;end;
function TTiny.Table(Rows,Cols: NativeInt): TTable;
var R,C: NativeInt;
begin
 if Rows*Cols>65000 then raise TJSError.new('Model table too large.');
 Result:=TTable.Create;Result.Rows:=Rows;Result.Cols:=Cols;
 Result.Scale:=TJSFloat32Array.new(Rows);Result.W:=TJSInt8Array.new(Rows*Cols);
 for R:=0 to Rows-1 do begin Result.Scale[R]:=ReadFloat;Need(Cols);for C:=0 to Cols-1 do Result.W[R*Cols+C]:=View.getInt8(Offset+C);Inc(Offset,Cols);end;
end;
constructor TTiny.FromBuffer(Buffer: TJSArrayBuffer);
var I: NativeInt; B: TLayer;
begin
 View:=TJSDataView.new(Buffer);Offset:=0;Need(12);
 if (View.getUint8(0)<>84) or (View.getUint8(1)<>78) or (View.getUint8(2)<>89) or (View.getUint8(3)<>50) then raise TJSError.new('Not a TINY version 2 model.');
 Offset:=4;D:=Read16;L:=Read16;H:=Read16;HID:=Read16;
 if (D<8) or (D>128) or (L<1) or (L>8) or (H<1) or (HID<8) or (HID>512) then raise TJSError.new('Unsupported model dimensions.');
 if D mod H<>0 then raise TJSError.new('Unsupported model dimensions.');
 HD:=D div H;Divisor:=F(Sqrt(HD));Emb:=Table(97,D);Pos:=Table(128,D);SetLength(Layers,L);
 for I:=0 to L-1 do begin B:=TLayer.Create;Layers[I]:=B;B.G1:=Gains;B.WQ:=Table(D,D);B.WK:=Table(D,D);B.WV:=Table(D,D);B.WO:=Table(D,D);B.G2:=Gains;B.F1:=Table(HID,D);B.F2:=Table(D,HID);B.KC:=TJSInt8Array.new(128*D);B.VC:=TJSInt8Array.new(128*D);B.KS:=TJSFloat32Array.new(128);B.VS:=TJSFloat32Array.new(128);end;
 GF:=Gains;if Offset<>View.byteLength then raise TJSError.new('TINY.BIN has the wrong size.');
 X:=TJSFloat32Array.new(D);BH:=TJSFloat32Array.new(D);Q:=TJSFloat32Array.new(D);T:=TJSFloat32Array.new(D);A:=TJSFloat32Array.new(D);M:=TJSFloat32Array.new(HID);S:=TJSFloat32Array.new(128);Score:=TJSFloat32Array.new(97);Activity:=TJSFloat32Array.new(L);
end;
procedure TTiny.Mat(TB: TTable; Input,Output: TJSFloat32Array);
var R,C: NativeInt; Sum: Double;
begin for R:=0 to TB.Rows-1 do begin Sum:=0;for C:=0 to TB.Cols-1 do Sum:=F(Sum+F(TB.W[R*TB.Cols+C]*Input[C]));Output[R]:=Sum*TB.Scale[R];end;end;
procedure TTiny.Norm(Input,Gain,Output: TJSFloat32Array);
var I: NativeInt; Sum,Z: Double;
begin Sum:=0;for I:=0 to D-1 do Sum:=F(Sum+F(Input[I]*Input[I]));Z:=F(1/Sqrt(F(Sum/D)+1e-5));for I:=0 to D-1 do Output[I]:=F(Input[I]*Z)*Gain[I];end;
function TTiny.Store(Dest: TJSInt8Array; P: NativeInt; Input: TJSFloat32Array): Double;
var I: NativeInt; Big,K,Z: Double;
begin Big:=1e-20;for I:=0 to D-1 do if Abs(Input[I])>Big then Big:=Abs(Input[I]);K:=F(127/Big);for I:=0 to D-1 do begin Z:=F(Input[I]*K);if Z<0 then Dest[P*D+I]:=Trunc(Z-0.5) else Dest[P*D+I]:=Trunc(Z+0.5);end;Result:=F(Big/127);end;
procedure TTiny.Step(Tok,P: NativeInt);
var I,J,LI,Head,Offs: NativeInt; B: TLayer; Sum,Big,Z,Act: Double;
begin
 for I:=0 to D-1 do X[I]:=F(Emb.W[Tok*D+I]*Emb.Scale[Tok])+F(Pos.W[P*D+I]*Pos.Scale[P]);
 for LI:=0 to L-1 do begin
  B:=Layers[LI];Norm(X,B.G1,BH);Mat(B.WK,BH,T);B.KS[P]:=Store(B.KC,P,T);Mat(B.WV,BH,T);B.VS[P]:=Store(B.VC,P,T);Mat(B.WQ,BH,Q);
  for Head:=0 to H-1 do begin
   Big:=-1e30;Offs:=Head*HD;
   for J:=0 to P do begin Sum:=0;for I:=0 to HD-1 do Sum:=F(Sum+F(Q[Offs+I]*B.KC[J*D+Offs+I]));S[J]:=F(Sum*B.KS[J])/Divisor;if S[J]>Big then Big:=S[J];end;
   Sum:=0;for J:=0 to P do begin S[J]:=Exp(F(S[J]-Big));Sum:=F(Sum+S[J]);end;
   for I:=0 to HD-1 do A[Offs+I]:=0;
   for J:=0 to P do begin Z:=F(F(S[J]*B.VS[J])/Sum);for I:=0 to HD-1 do A[Offs+I]:=F(A[Offs+I]+F(Z*B.VC[J*D+Offs+I]));end;
  end;
  Mat(B.WO,A,T);for I:=0 to D-1 do X[I]:=X[I]+T[I];Norm(X,B.G2,BH);Mat(B.F1,BH,M);Act:=0;
  for I:=0 to HID-1 do begin if M[I]<0 then M[I]:=0;Act:=F(Act+M[I]);end;
  Activity[LI]:=Act/HID;Mat(B.F2,M,T);for I:=0 to D-1 do X[I]:=X[I]+T[I];
 end;
 Norm(X,GF,BH);Mat(Emb,BH,Score);
end;
function TTiny.Pick(Creativity: NativeInt): NativeInt;
var I,Best,Tok: NativeInt; Sum,R: Double;
begin
 Best:=0;for I:=1 to 96 do if Score[I]>Score[Best] then Best:=I;Tok:=Best;
 if Creativity>0 then begin Sum:=0;for I:=0 to 96 do begin S[I]:=Exp((Score[I]-Score[Best])/(Creativity/5));if S[I]<0.15 then S[I]:=0;Sum:=Sum+S[I];end;R:=Random*Sum;for I:=0 to 96 do begin R:=R-S[I];if R<0 then begin Tok:=I;Break;end;end;end;
 Sum:=0;for I:=0 to 96 do Sum:=Sum+Exp(Score[I]-Score[Tok]);Confidence:=1/Sum;Result:=Tok;
end;
end.
