function ConvertFrom-PluginLiteral([string]$Text) {
    if ($Text.Length -gt 4MB) { throw 'Liste de plugins trop volumineuse.' }
    if (-not ('RPGMToolkitLiteral' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Text.RegularExpressions;
public static class RPGMToolkitLiteral {
    static int Skip(string s, int i) {
        while (i < s.Length) {
            if (char.IsWhiteSpace(s[i])) { i++; continue; }
            if (i+1<s.Length && s[i]=='/' && s[i+1]=='/') { i+=2; while(i<s.Length && s[i]!='\n') i++; continue; }
            if (i+1<s.Length && s[i]=='/' && s[i+1]=='*') { int end=s.IndexOf("*/",i+2,StringComparison.Ordinal); if(end<0) throw new FormatException("Commentaire incomplet."); i=end+2; continue; }
            break;
        }
        return i;
    }
    static void Character(StringBuilder output, char c) {
        if(c=='"'||c=='\\') output.Append('\\').Append(c);
        else if(c<32) output.Append("\\u").Append(((int)c).ToString("x4"));
        else output.Append(c);
    }
    public static string Convert(string s) {
        var output=new StringBuilder(); int i=0,depth=0;
        while((i=Skip(s,i))<s.Length) {
            char c=s[i++];
            if(c=='"'||c=='\'') {
                char quote=c; bool closed=false; output.Append('"');
                while(i<s.Length) {
                    c=s[i++]; if(c==quote) {closed=true;break;}
                    if(c=='\\') {
                        if(i==s.Length) throw new FormatException("Echappement incomplet."); c=s[i++];
                        if(c=='\r'||c=='\n') {if(c=='\r'&&i<s.Length&&s[i]=='\n')i++;continue;}
                        if(c=='u'||c=='x') {int n=c=='u'?4:2;if(i+n>s.Length)throw new FormatException("Unicode incomplet.");Character(output,(char)System.Convert.ToInt32(s.Substring(i,n),16));i+=n;continue;}
                        switch(c) {case 'n': c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;case 'b':c='\b';break;case 'f':c='\f';break;case 'v':c='\v';break;case '0':if(i<s.Length&&char.IsDigit(s[i]))throw new FormatException("Octal non pris en charge.");c='\0';break;}
                    } else if(c<32) throw new FormatException("Controle dans une chaine.");
                    Character(output,c);
                }
                if(!closed)throw new FormatException("Chaine incomplete.");output.Append('"');continue;
            }
            if(char.IsLetter(c)||c=='_'||c=='$') {
                int start=i-1;while(i<s.Length&&(char.IsLetterOrDigit(s[i])||s[i]=='_'||s[i]=='$'))i++;
                string token=s.Substring(start,i-start);int next=Skip(s,i);
                if(next<s.Length&&s[next]==':')output.Append('"').Append(token).Append('"');
                else if(token=="true"||token=="false"||token=="null")output.Append(token);
                else throw new FormatException("Expression JavaScript non prise en charge.");
                continue;
            }
            if(char.IsDigit(c)||c=='-'||c=='+'||c=='.') {
                var match=Regex.Match(s.Substring(i-1),@"^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)");
                if(!match.Success)throw new FormatException("Nombre invalide.");string number=match.Value;i+=number.Length-1;
                bool negative=number.StartsWith("-");string unsigned=number.TrimStart('+','-');
                if(unsigned.StartsWith("0x",StringComparison.OrdinalIgnoreCase))number=(negative?"-":"")+System.Convert.ToInt64(unsigned.Substring(2),16).ToString(System.Globalization.CultureInfo.InvariantCulture);
                else {number=number.TrimStart('+');number=Regex.Replace(number,@"^(\-?)\.","${1}0.");number=Regex.Replace(number,@"\.(?=[eE]|$)",".0");}
                output.Append(number);continue;
            }
            if(c=='['||c=='{') {if(++depth>64)throw new FormatException("Liste trop imbriquee.");}
            else if(c==']'||c=='}') {if(--depth<0)throw new FormatException("Liste invalide.");}
            else if(c==',') {int next=Skip(s,i);if(next<s.Length&&(s[next]==']'||s[next]=='}'))continue;}
            else if(c!=':')throw new FormatException("Expression JavaScript non prise en charge.");
            output.Append(c);
        }
        if(depth!=0)throw new FormatException("Liste incomplete.");return output.ToString();
    }
}
'@
    }
    ConvertFrom-Json -InputObject ([RPGMToolkitLiteral]::Convert($Text))
}
