# RPGM Toolkit 1.6.0 - RGSS1 / RGSS2 / RGSS3
# SPDX-License-Identifier: MIT
module RPGMToolkit
  VERSION = '1.6.0'
  FILE = 'RPGMToolkit-settings.dat'
  DICTIONARY = 'RPGMToolkit-translations.tsv'
  CATEGORIES = [:variables, :switches, :self_switches, :items, :weapons, :armors, :actors, :skills, :states, :favorites]
  LABELS = {
    :editors=>['Editeurs','Editors'], :translations=>['Traductions','Translations'],
    :god=>['Godmode','Godmode'], :noclip=>['No Clip','No Clip'], :resources=>['HP / MP','HP / MP'],
    :stats=>['Stats','Stats'], :teleport=>['Teleportation','Teleport'], :party=>['Partie','Party'],
    :history=>['Historique','History'], :settings=>['Parametres','Settings'],
    :variables=>['Variables','Variables'], :switches=>['Interrupteurs','Switches'],
    :self_switches=>['Interr. locaux','Self switches'], :items=>['Objets','Items'],
    :weapons=>['Armes','Weapons'], :armors=>['Armures','Armors'], :actors=>['Acteurs','Actors'],
    :skills=>['Competences','Skills'], :states=>['Etats','States'], :favorites=>['Favoris','Favorites'],
    :search=>['Rechercher','Search'], :all=>['Tous','All'], :value=>['Valeur','Value'],
    :edit=>['Modifier','Edit'], :freeze=>['Figer','Freeze'], :unfreeze=>['Liberer','Unfreeze'],
    :save=>['Enregistrer','Save'], :back=>['Retour','Back'], :close=>['Fermer','Close'],
    :select=>['Selection','Selection'], :apply=>['Appliquer','Apply'], :cancel=>['Annuler','Cancel'],
    :gold=>['Or','Gold'], :level=>['Niveau','Level'], :actor=>['Acteur','Actor'],
    :delete=>['Supprimer le dictionnaire','Delete dictionary'], :import=>['Importer TSV','Import TSV'],
    :export=>['Exporter TSV','Export TSV'], :names=>['Exporter les noms','Export names'],
    :english=>['Noms anglais','English names'], :language=>['Langue','Language'],
    :undo=>['Annuler une modification','Undo last change'], :font=>['Taille du texte','Text size'],
    :rail=>['Barre de defilement','Scrollbar'], :page=>['Lignes par page','Rows per page'],
    :launch=>['Bouton Toolbox','Toolbox button'], :heal=>['Tout restaurer','Restore all'],
    :enemies=>['Ennemis','Enemies'], :team=>['Equipe','Party'], :start=>['Traduire','Translate'],
    :stop=>['Arreter','Stop'], :source=>['Langue source','Source language']
  }
  DESCRIPTIONS = {
    :editors=>['Variables, objets, armes, armures','Variables, items, weapons, armor'],
    :translations=>['Noms anglais et dictionnaire','English names and dictionary'],
    :god=>['HP au maximum, protection K.O.','Full HP, knockout protection'],
    :noclip=>['Traverser les obstacles','Walk through obstacles'],
    :resources=>['Allies et ennemis','Allies and enemies'], :stats=>['Niveau et parametres','Level and parameters'],
    :teleport=>['Carte et position','Map and position'], :party=>['Or et sauvegarde','Gold and save'],
    :history=>['Dernieres modifications','Recent changes'], :settings=>['Langue, affichage et raccourci','Language, display and shortcut']
  }
  class << self
    attr_accessor :god, :noclip, :busy
    def engine
      return 3 if defined?(SceneManager) && defined?(RPG::System::Terms)
      return 2 if defined?(Window_Base) && Window_Base.method_defined?(:draw_actor_mp)
      1
    end
    def prefs
      return @prefs if @prefs
      @prefs = {'language'=>'fr','english'=>false,'font'=>18,'rail'=>24,'rows'=>60,'launch'=>true,'aliases'=>{},'favorites'=>{},'source'=>'ja'}
      begin
        saved = File.open(FILE,'rb') { |f| Marshal.load(f) } if File.exist?(FILE)
        if saved.is_a?(Hash)
          @prefs.keys.each { |k| @prefs[k] = saved[k] if saved[k].class == @prefs[k].class || ([true,false].include?(@prefs[k]) && [true,false].include?(saved[k])) }
        end
      rescue StandardError
      end
      @prefs['font'] = [14,18,22].include?(@prefs['font']) ? @prefs['font'] : 18
      @prefs['rail'] = [18,24,32].include?(@prefs['rail']) ? @prefs['rail'] : 24
      @prefs['rows'] = [20,40,60,80].include?(@prefs['rows']) ? @prefs['rows'] : 60
      @prefs
    end
    def persist
      File.open(FILE,'wb') { |f| Marshal.dump(prefs,f) }
    end
    def t(key)
      a = LABELS[key] || [key.to_s,key.to_s]
      a[prefs['language']=='en' ? 1 : 0]
    end
    def members
      $game_party.respond_to?(:members) ? $game_party.members : $game_party.actors
    end
    def enemies
      return [] unless defined?($game_troop) && $game_troop
      $game_troop.respond_to?(:members) ? $game_troop.members : $game_troop.enemies
    end
    def battle?
      scene = defined?(SceneManager) ? SceneManager.scene : $scene
      defined?(Scene_Battle) && scene.is_a?(Scene_Battle)
    end
    def available?
      return false unless defined?($game_variables) && $game_variables && defined?($game_party) && $game_party && defined?($game_map) && $game_map
      scene = defined?(SceneManager) ? SceneManager.scene : $scene
      scene && (scene.is_a?(Scene_Map) || (defined?(Scene_Battle) && scene.is_a?(Scene_Battle)))
    end
    def frozen; @frozen ||= {}; end
    def journal; @journal ||= []; end
    def actor; $game_actors[@actor_id || (members[0] && members[0].id) || 1]; end
    def actor_id=(id); @actor_id = id; end
    def key(r); r[0].to_s + ':' + r[1].to_s + ([:skills,:states].include?(r[0]) ? ':' + actor.id.to_s : ''); end
    def catalog(categories)
      result=[]; categories.each { |c| result.concat(records(c)) }; result
    end
    def records(category)
      case category
      when :variables, :switches
        names = category == :variables ? $data_system.variables : $data_system.switches
        (1...names.size).collect { |i| [category,i,names[i].to_s,nil] }
      when :self_switches
        result=[]; $game_map.events.keys.sort.each { |i| ['A','B','C','D'].each { |letter| result << [category,[$game_map.map_id,i,letter],i.to_s+' '+letter,nil] } }; result
      when :favorites
        catalog(CATEGORIES.reject { |c| c==:favorites }).select { |r| prefs['favorites'][key(r)] }
      else
        data = {:items=>$data_items,:weapons=>$data_weapons,:armors=>$data_armors,:actors=>$data_actors,:skills=>$data_skills,:states=>$data_states}[category] || []
        result=[]; data.each_with_index { |obj,i| result << [category,i,obj.name,obj] if obj && i>0 }; result
      end
    end
    def value(r)
      id=r[1]
      case r[0]
      when :variables then $game_variables[id]
      when :switches then $game_switches[id]
      when :self_switches then !!$game_self_switches[id]
      when :items,:weapons,:armors
        if engine==1
          $game_party.send({:items=>:item_number,:weapons=>:weapon_number,:armors=>:armor_number}[r[0]],id)
        else
          $game_party.item_number(r[3])
        end
      when :actors then $game_actors[id].level
      when :skills then actor.respond_to?(:skill_learn?) ? actor.skill_learn?(engine==1 ? id : r[3]) : actor.skills.include?(id)
      when :states then actor.respond_to?(:state?) ? actor.state?(id) : actor.states.include?(id)
      end
    end
    def assign(r,v,remember=true)
      old=value(r)
      if remember
        journal << [r.dup,old,actor && actor.id]; journal.shift if journal.size>100
        frozen[key(r)]=[r.dup,v] if frozen.has_key?(key(r))
      end
      @writing=true
      id=r[1]
      case r[0]
      when :variables then $game_variables[id]=v
      when :switches then $game_switches[id]=!!v
      when :self_switches then $game_self_switches[id]=!!v
      when :items,:weapons,:armors
        amount=[[v.to_i,0].max,9999].min-value(r)
        if engine==1
          $game_party.send({:items=>:gain_item,:weapons=>:gain_weapon,:armors=>:gain_armor}[r[0]],id,amount)
        else
          $game_party.gain_item(r[3],amount)
        end
      when :actors
        a=$game_actors[id]; n=[[v.to_i,1].max,99].min
        a.respond_to?(:change_level) ? a.change_level(n,false) : a.level=n
      when :skills
        v ? actor.learn_skill(id) : actor.forget_skill(id)
      when :states
        v ? actor.add_state(id) : actor.remove_state(id)
      end
      $game_map.need_refresh=true if $game_map.respond_to?(:need_refresh=)
      value(r)
    ensure
      @writing=false
    end
    def frozen_value(category,id,v)
      return v if @writing
      found=frozen[category.to_s+':'+id.to_s]
      found ? found[1] : v
    end
    def name(r)
      entry=prefs['aliases'][key(r)]
      prefs['english'] && entry.is_a?(Array) && entry[0]==r[2] ? entry[1].to_s : r[2]
    end
    def hp_max(a); a.respond_to?(:mhp) ? a.mhp : a.maxhp; end
    def mp(a); a.respond_to?(:mp) ? a.mp : a.sp; end
    def mp_max(a); a.respond_to?(:mmp) ? a.mmp : a.respond_to?(:maxmp) ? a.maxmp : a.maxsp; end
    def set_resource(a,k,v)
      if k==:hp then a.hp=[[v.to_i,0].max,hp_max(a)].min
      elsif k==:mp then a.send(a.respond_to?(:mp=) ? :mp= : :sp=,[[v.to_i,0].max,mp_max(a)].min)
      elsif a.respond_to?(:tp=) then a.tp=[[v.to_i,0].max,100].min
      end
    end
    def hooks
      return if @hooks || !defined?(Game_Variables) || !defined?(Game_Battler) || !defined?(Game_Switches) || !defined?(Game_SelfSwitches)
      @hooks=true
      Game_Variables.class_eval do
        alias rpgmt_variables_set []=
        def []=(id,v); rpgmt_variables_set(id,RPGMToolkit.frozen_value(:variables,id,v)); end
      end
      Game_Switches.class_eval do
        alias rpgmt_switches_set []=
        def []=(id,v); rpgmt_switches_set(id,RPGMToolkit.frozen_value(:switches,id,v)); end
      end
      Game_SelfSwitches.class_eval do
        alias rpgmt_local_set []=
        def []=(id,v); rpgmt_local_set(id,RPGMToolkit.frozen_value(:self_switches,id,v)); end
      end
      Game_Battler.class_eval do
        alias rpgmt_hp_set hp=
        def hp=(v)
          v=RPGMToolkit.hp_max(self) if RPGMToolkit.god && self.is_a?(Game_Actor)
          self.rpgmt_hp_set(v)
        end
        alias rpgmt_add_state add_state
        def add_state(id,*args)
          return if RPGMToolkit.god && self.is_a?(Game_Actor) && id==(respond_to?(:death_state_id) ? death_state_id : 1)
          rpgmt_add_state(id,*args)
        end
      end
    end
    def tick
      return if @busy
      hooks
      if @session != (defined?($game_variables) && $game_variables)
        @session=$game_variables; @frozen={}; @journal=[]; @god=false; @noclip=false; @player=nil
      end
      unless available?
        @launcher.visible=false if @launcher
        return
      end
      if @god then members.each { |a| a.hp=hp_max(a); a.remove_state(a.respond_to?(:death_state_id) ? a.death_state_id : 1) }; end
      if @noclip && $game_player
        if @player!=$game_player then @player=$game_player; @through=@player.through; end
        @player.through=true
      elsif @player
        @player.through=@through; @player=nil
      end
      frozen.values.each { |r,v| assign(r,v,false) unless [:variables,:switches,:self_switches].include?(r[0]) }
      flush_translations
      @launcher ||= Sprite.new
      @launcher.z=999998
      unless @launcher.bitmap
        @launcher.bitmap=Bitmap.new(100,30); @launcher.bitmap.fill_rect(0,0,100,30,Color.new(45,53,67,230)); @launcher.bitmap.font.size=18; @launcher.bitmap.draw_text(0,0,100,30,'Toolbox',1)
        @launcher.x=6; @launcher.y=6
      end
      @launcher.visible=prefs['launch']
      hot=Input.const_defined?('F6') && Input.trigger?(Input.const_get('F6'))
      click=mouse_trigger? && mouse_x<106 && mouse_y<36 && prefs['launch']
      open if hot || click
    rescue StandardError => e
      @last_error=e.message
    end
    def mouse_x; Input.respond_to?(:mouse_x) ? Input.mouse_x : -1; end
    def mouse_y; Input.respond_to?(:mouse_y) ? Input.mouse_y : -1; end
    def mouse_down?; Input.const_defined?('MOUSELEFT') && Input.press?(Input.const_get('MOUSELEFT')); end
    def mouse_trigger?; Input.const_defined?('MOUSELEFT') && Input.trigger?(Input.const_get('MOUSELEFT')); end
    def open
      return unless available? && !@busy
      @busy=true; @launcher.visible=false if @launcher
      UI.new.run
    ensure
      @busy=false
      Input.update
    end
    def save_game
      return if battle?
      if defined?(SceneManager) then SceneManager.call(Scene_Save) else $scene=Scene_Save.new end
    end
    def maps
      @maps ||= load_data('Data/MapInfos.'+(engine==1 ? 'rxdata' : engine==2 ? 'rvdata' : 'rvdata2'))
    end
    def transfer(id,x,y)
      raise 'Combat en cours / Battle in progress' if battle?
      ext=engine==1 ? 'rxdata' : engine==2 ? 'rvdata' : 'rvdata2'
      map=load_data(sprintf('Data/Map%03d.%s',id,ext))
      raise 'Position invalide / Invalid position' unless x>=0 && y>=0 && x<map.width && y<map.height
      if $game_player.respond_to?(:reserve_transfer)
        $game_player.reserve_transfer(id,x,y,2)
      else
        $game_temp.player_transferring=true; $game_temp.player_new_map_id=id; $game_temp.player_new_x=x; $game_temp.player_new_y=y; $game_temp.player_new_direction=2
      end
    end
    def export_aliases(names_only=false)
      list=catalog(CATEGORIES.reject { |c| c==:favorites || c==:self_switches })
      File.open(names_only ? 'RPGMToolkit-names.tsv' : DICTIONARY,'wb') do |f|
        list.each do |r|
          en=prefs['aliases'][key(r)]; next unless names_only || en
          f.write([key(r),r[2],en && en[1]].collect { |s| s.to_s.gsub(/[\t\r\n]/,' ') }.join("\t")+"\n")
        end
      end
    end
    def import_aliases
      raise 'TSV absent' unless File.exist?(DICTIONARY)
      raise 'TSV > 4 Mo' if File.size(DICTIONARY)>4*1024*1024
      File.open(DICTIONARY,'rb') { |f| f.each_line { |line| k,original,en=line.chomp.split("\t",3); prefs['aliases'][k]=[original,en] if k && original && en && en.size<=1000 } }; persist
    end
    def translate
      return if @worker && @worker.alive?
      require 'net/http'; require 'json'; require 'uri'; require 'openssl'
      @cancel=false; @translated=[]; @translation_status='0'
      list=catalog(CATEGORIES.reject { |c| c==:favorites || c==:self_switches }).reject { |r| r[2].empty? || prefs['aliases'].has_key?(key(r)) }
      source=prefs['source']; pending=list.collect { |r| [key(r),r[2]] }
      @worker=Thread.new do
        begin
          pending.each_with_index do |pair,i|
            break if @cancel
            uri=URI.parse('https://api.mymemory.translated.net/get?q='+pair[1].unpack('C*').collect { |byte| sprintf('%%%02X',byte) }.join+'&langpair='+source+'%7Cen')
            http=Net::HTTP.new(uri.host,uri.port); http.use_ssl=true; http.verify_mode=OpenSSL::SSL::VERIFY_PEER; http.open_timeout=10; http.read_timeout=15
            response=JSON.parse(http.get(uri.request_uri).body)
            raise response['responseDetails'].to_s unless response['responseStatus'].to_i==200
            break if @cancel
            translated=response['responseData']['translatedText']
            @translated << [pair[0],pair[1],translated] if translated.is_a?(String)
            @translation_status=(i+1).to_s+'/'+pending.size.to_s
          end
        rescue StandardError => e
          @translation_status=e.message
        end
      end
    rescue LoadError, NameError
      raise 'HTTP/JSON indisponible. Importer TSV / Import TSV.'
    end
    def stop_translation; @cancel=true; @translated.clear if @translated; end
    def translation_status; @translation_status.to_s; end
    def flush_translations
      return unless @translated && !@translated.empty?
      while row=@translated.shift; prefs['aliases'][row[0]]=[row[1],row[2]]; end
      persist
    end
  end

  class UI
    def initialize
      @w=Graphics.respond_to?(:width) ? Graphics.width : 640
      @h=Graphics.respond_to?(:height) ? Graphics.height : 480
      @sprite=Sprite.new; @sprite.z=999999; @sprite.bitmap=Bitmap.new(@w,@h)
      @b=@sprite.bitmap; @buttons=[]; @focus=0; @scroll=0; @page=0; @mode=:home; @category=:variables; @query=''; @filter=:all; @selection={}; @target=RPGMToolkit.members[0]; @message=''; @done=false
    end
    def t(k); RPGMToolkit.t(k); end
    def color(v); Color.new(*v); end
    def text(x,y,w,h,s,muted=false)
      @b.font.color=color(muted ? [187,198,214] : [239,241,246]); @b.draw_text(x,y,[w,1].max,h,s.to_s)
    end
    def button(x,y,w,h,label,&block)
      i=@buttons.size; @buttons << [x,y,w,h,block]
      @b.fill_rect(x,y,w,h,color(i==@focus ? [75,99,130] : [45,50,60])); text(x+5,y,w-10,h,label)
    end
    def run
      while !@done
        draw
        Graphics.rpgmt_update
        Input.update
        RPGMToolkit.flush_translations
        input
      end
    ensure
      @b.dispose unless @b.disposed?; @sprite.dispose unless @sprite.disposed?
    end
    def safe
      yield
      @filtered=nil
    rescue StandardError => e
      @message=e.message.to_s
    end
    def input
      if Input.trigger?(Input::B) then back; return; end
      if Input.trigger?(Input::F6) then @done=true; return; end
      if Input.repeat?(Input::DOWN)
        if @focus>=@buttons.size-2 && @scroll<@max_scroll then scroll(1) else @focus=(@focus+1)%[@buttons.size,1].max; reveal end
      end
      if Input.repeat?(Input::UP)
        if @focus<=1 && @scroll>0 then scroll(-1) else @focus=(@focus-1)%[@buttons.size,1].max; reveal end
      end
      if Input.repeat?(Input::R) then scroll(5); end
      if Input.repeat?(Input::L) then scroll(-5); end
      if Input.trigger?(Input::C) then safe { @buttons[@focus][4].call if @buttons[@focus] }; end
      if RPGMToolkit.mouse_trigger?
        @drag_y=RPGMToolkit.mouse_y; @drag_start=@scroll; @dragged=false; @rail_drag=RPGMToolkit.mouse_x>=@w-RPGMToolkit.prefs['rail'] && @drag_y>=@top && @drag_y<@bottom
      end
      if @drag_y && RPGMToolkit.mouse_down?
        distance=RPGMToolkit.mouse_y-@drag_y
        @dragged=true if distance.abs>8
        if @rail_drag
          @scroll=[[(RPGMToolkit.mouse_y-@top)*@max_scroll/[@bottom-@top,1].max,0].max,@max_scroll].min
        elsif @dragged
          @scroll=[[@drag_start-distance,0].max,@max_scroll].min
        end
      elsif @drag_y
        unless @dragged || @rail_drag
          x=RPGMToolkit.mouse_x; y=RPGMToolkit.mouse_y
          i=nil
          @buttons.each_with_index { |b,n| i=n if x>=b[0] && x<b[0]+b[2] && y>=b[1] && y<b[1]+b[3] }
          if i then @focus=i; safe { @buttons[i][4].call }; end
        end
        @drag_y=nil
      end
    end
    def reveal
      b=@buttons[@focus]; return unless b
      @scroll=[@scroll+40,@max_scroll].min if b[1]+b[3]>@bottom
      @scroll=[@scroll-40,0].max if b[1]<@top && @focus>1
    end
    def scroll(n); @scroll=[[@scroll+n*32,0].max,@max_scroll].min; end
    def back
      if @modal then @modal=nil; @filtered=nil
      elsif @mode==:home then @done=true
      else @mode=:home; @scroll=0; @focus=0 end
    end
    def mode(m); @filtered=nil; @mode=m; @scroll=0; @focus=0; @selection={}; end
    def draw
      @buttons=[]; @b.fill_rect(0,0,@w,@h,color([29,32,38])); @b.font.size=RPGMToolkit.prefs['font']; @top=40; @bottom=@h-38; @content=0
      if @modal then draw_modal; return; end
      button(6,5,32,30,'X') { back }
      text(48,5,@w-54,30,@mode==:home ? 'Toolbox' : t(@mode))
      if @mode==:editors then draw_editors
      elsif @mode==:home then draw_home
      else draw_tools end
      rail
      @b.fill_rect(0,@h-35,@w,35,color([23,26,32])); text(8,@h-35,@w-132,35,@message,true)
      button(@w-120,@h-32,112,28,t(:save)) { RPGMToolkit.persist; @message='OK' }
    end
    def row(label,description=nil,&action)
      h=description ? 58 : 38; y=@top+@content-@scroll; @content+=h+4
      return if y+h<=@top || y>=@bottom
      visible_y=[y,@top].max
      button(8,visible_y,@w-RPGMToolkit.prefs['rail']-20,[y+h,@bottom].min-visible_y,label,&action)
      text(14,y+28,@w-70,24,description,true) if description && y+52<@bottom
    end
    def rail
      @max_scroll=[@content-(@bottom-@top),0].max; @scroll=[@scroll,@max_scroll].min
      width=RPGMToolkit.prefs['rail']; @b.fill_rect(@w-width,@top,width,@bottom-@top,color([18,22,29]))
      height=[24,(@bottom-@top)*(@bottom-@top)/[@content,1].max].max; height=[height,@bottom-@top].min
      y=@top+(@bottom-@top-height)*@scroll/[@max_scroll,1].max
      @b.fill_rect(@w-width+4,y,width-8,height,color([155,177,207]))
    end
    def draw_home
      [:editors,:translations,:god,:noclip,:resources,:stats,:teleport,:party,:history,:settings].each do |m|
        title=t(m); title+='   '+((m==:god ? RPGMToolkit.god : RPGMToolkit.noclip) ? '[ON]' : '[OFF]') if [:god,:noclip].include?(m)
        row(title,DESCRIPTIONS[m][RPGMToolkit.prefs['language']=='en' ? 1 : 0]) do
          if m==:god then RPGMToolkit.god=!RPGMToolkit.god
          elsif m==:noclip then RPGMToolkit.noclip=!RPGMToolkit.noclip
          else mode(m) end
        end
      end
    end
    def prompt(label,value='',&apply)
      @modal={:label=>label,:text=>value.to_s,:apply=>apply,:shift=>false}; @focus=0; @scroll=0
    end
    def draw_modal
      text(12,4,@w-50,30,@modal[:label]); button(@w-38,4,32,30,'X') { @modal=nil }
      @b.fill_rect(10,42,@w-20,34,color([19,23,29])); text(16,42,@w-32,34,@modal[:text])
      chars=@modal[:shift] ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-_:/ ' : 'abcdefghijklmnopqrstuvwxyz0123456789.,-_:/ '
      @top=84; @bottom=@h-44; cellw=(@w-24)/10; cellh=[32,(@bottom-@top-42)/5].max
      chars.split('').each_with_index do |c,i|
        y=@top+(i/10)*cellh-@scroll
        button(8+(i%10)*cellw,y,cellw-3,cellh-3,c==' ' ? '_' : c) { @modal[:text]+=c if @modal[:text].size<1000 } if y>=@top && y+cellh<=@bottom
      end
      y=@top+5*cellh-@scroll
      if y>=@top && y+30<=@bottom
      button(8,y,70,30,'Aa') { @modal[:shift]=!@modal[:shift] }
      button(84,y,80,30,'DEL') { @modal[:text]=@modal[:text][0...-1] }
      button(170,y,80,30,'Clear') { @modal[:text]='' }
      if @modal[:kind]
        button(256,y,110,30,@modal[:kind]) { kinds=['int','float','bool','string']; @modal[:kind]=kinds[(kinds.index(@modal[:kind])+1)%kinds.size] }
      end
      end
      button(8,@h-38,110,30,t(:cancel)) { @modal=nil }
      button(@w-128,@h-38,120,30,t(:apply)) { m=@modal; safe { m[:apply].call(m[:text]); @modal=nil } }
      @content=5*cellh+40; rail
    end
    def draw_editors
      button(120,5,@w-128,30,t(:search)+': '+@query) { prompt(t(:search),@query) { |s| @query=s; @page=0; @scroll=0 } }
      button(8,40,(@w-24)/2,30,t(@category)) { @category=CATEGORIES[(CATEGORIES.index(@category)+1)%CATEGORIES.size]; @selection={}; @page=0; @scroll=0 }
      button(@w/2,40,@w/2-8,30,t(@filter)) { filters=[:all,:int,:bool,:string,:value]; @filter=filters[(filters.index(@filter)+1)%filters.size]; @page=0; @scroll=0 }
      @top=110; @bottom=@h-72
      list=@filtered ||= RPGMToolkit.records(@category).select do |r|
        v=RPGMToolkit.value(r); match=@filter==:all || (@filter==:int && v.is_a?(Numeric)) || (@filter==:bool && (v==true || v==false)) || (@filter==:string && v.is_a?(String)) || (@filter==:value && v!=0 && v!=false && v!='')
        match && (RPGMToolkit.name(r).downcase.include?(@query.downcase) || r[1].to_s.include?(@query) || v.to_s.downcase.include?(@query.downcase))
      end
      size=RPGMToolkit.prefs['rows']; pages=[(list.size+size-1)/size,1].max; @page=[@page,pages-1].min
      current=list[@page*size,size] || []
      button(8,76,100,28,t(:select)) { all=current.all? { |r| @selection[RPGMToolkit.key(r)] }; current.each { |r| all ? @selection.delete(RPGMToolkit.key(r)) : @selection[RPGMToolkit.key(r)]=r } }
      button(114,76,90,28,t(:edit)) { edit(@selection.values) }
      button(210,76,80,28,t(:freeze)) { toggle_freeze(@selection.values) }
      if [:skills,:states].include?(@category)
        button(296,76,@w-304,28,RPGMToolkit.actor.name) { ids=RPGMToolkit.records(:actors).collect { |r| r[1] }; RPGMToolkit.actor_id=ids[((ids.index(RPGMToolkit.actor.id)||0)+1)%ids.size]; @selection={} }
      end
      current.each do |r|
        y=@top+@content-@scroll; @content+=34; next if y<@top || y+32>@bottom
        key=RPGMToolkit.key(r); v=RPGMToolkit.value(r); edge=@w-RPGMToolkit.prefs['rail']-6
        button(4,y,26,30,@selection[key] ? 'x' : '') { @selection[key] ? @selection.delete(key) : @selection[key]=r }
        icon(r,34,y+5)
        text(58,y,[edge-270,30].max,30,r[1].to_s+' '+RPGMToolkit.name(r))
        button(edge-208,y,70,30,v.to_s) { edit([r]) }
        button(edge-134,y,32,30,v==true || v==false ? 'T/F' : '-99') { RPGMToolkit.assign(r,v==true || v==false ? !v : v.to_i-99) }
        button(edge-98,y,32,30,v==true || v==false ? 'T/F' : '+99') { RPGMToolkit.assign(r,v==true || v==false ? !v : v.to_i+99) }
        button(edge-62,y,28,30,RPGMToolkit.prefs['favorites'][key] ? '*' : '+') { RPGMToolkit.prefs['favorites'][key]=!RPGMToolkit.prefs['favorites'][key]; RPGMToolkit.persist }
        button(edge-30,y,28,30,RPGMToolkit.frozen[key] ? 'L' : 'o') { toggle_freeze([r]) }
      end
      text(8,@h-70,@w-180,30,(@page+1).to_s+'/'+pages.to_s+'  '+list.size.to_s)
      button(@w-170,@h-70,72,28,'<') { @page=[@page-1,0].max; @scroll=0 }
      button(@w-92,@h-70,72,28,'>') { @page=[@page+1,pages-1].min; @scroll=0 }
    end
    def icon(r,x,y)
      return unless r[3]
      if RPGMToolkit.engine==1 && r[3].respond_to?(:icon_name)
        b=RPG::Cache.icon(r[3].icon_name); @b.blt(x,y,b,Rect.new(0,0,24,24))
      elsif r[3].respond_to?(:icon_index)
        b=Cache.system('Iconset'); n=r[3].icon_index; @b.blt(x,y,b,Rect.new(n%16*24,n/16*24,24,24))
      end
    rescue StandardError
    end
    def edit(records)
      return if records.empty?
      prompt(t(:value),RPGMToolkit.value(records[0]).to_s) do |s|
        v=case @modal[:kind]
        when 'int' then Integer(s)
        when 'float' then Float(s)
        when 'bool' then raise('true / false') unless ['true','false'].include?(s); s=='true'
        else s end
        records.each { |r| RPGMToolkit.assign(r,v) }
      end
      old=RPGMToolkit.value(records[0]); @modal[:kind]=old==true || old==false ? 'bool' : old.is_a?(Integer) ? 'int' : old.is_a?(Numeric) ? 'float' : 'string'
    end
    def toggle_freeze(records)
      raise '500 maximum' if RPGMToolkit.frozen.size+records.size>500
      unfreeze=records.all? { |r| RPGMToolkit.frozen.has_key?(RPGMToolkit.key(r)) }
      records.each { |r| k=RPGMToolkit.key(r); unfreeze ? RPGMToolkit.frozen.delete(k) : RPGMToolkit.frozen[k]=[r,RPGMToolkit.value(r)] }
    end
    def quick(label,value,&setter)
      y=@top+@content-@scroll; @content+=76; return if y<@top || y+70>@bottom
      text(12,y,@w-40,30,label+': '+value.to_s)
      w=(@w-RPGMToolkit.prefs['rail']-28)/4
      button(8,y+32,w,32,'0') { setter.call(0) }
      button(12+w,y+32,w,32,'-1000') { setter.call(value-1000) }
      button(16+w*2,y+32,w,32,'+1000') { setter.call(value+1000) }
      button(20+w*3,y+32,w,32,t(:edit)) { prompt(label,value) { |v| setter.call(Integer(v)) } }
    end
    def draw_tools
      case @mode
      when :resources
        targets=RPGMToolkit.members+(RPGMToolkit.battle? ? RPGMToolkit.enemies : [])
        @target=targets[0] unless targets.include?(@target)
        row(t(:actor)+': '+@target.name) { @target=targets[(targets.index(@target)+1)%targets.size] }
        a=@target
        quick('HP',a.hp) { |v| RPGMToolkit.set_resource(a,:hp,v) }
        quick('MP',RPGMToolkit.mp(a)) { |v| RPGMToolkit.set_resource(a,:mp,v) }
        quick('TP',a.tp) { |v| RPGMToolkit.set_resource(a,:tp,v) } if a.respond_to?(:tp)
        row(t(:heal)) { targets.each { |b| RPGMToolkit.set_resource(b,:hp,RPGMToolkit.hp_max(b)); RPGMToolkit.set_resource(b,:mp,RPGMToolkit.mp_max(b)) } }
      when :stats
        a=RPGMToolkit.actor
        row(t(:actor)+': '+a.name) { ids=RPGMToolkit.records(:actors).collect { |r| r[1] }; RPGMToolkit.actor_id=ids[((ids.index(a.id)||0)+1)%ids.size] }
        quick(t(:level),a.level) { |v| RPGMToolkit.assign([:actors,a.id,a.name,nil],v) }
        if RPGMToolkit.engine==3
          ['Max HP','Max MP','ATK','DEF','MAT','MDF','AGI','LUK'].each_with_index { |label,i| quick(label,a.param(i)) { |v| a.add_param(i,v-a.param(i)) } }
        else
          fields=RPGMToolkit.engine==1 ? [:maxhp,:maxsp,:str,:dex,:agi,:int] : [:maxhp,:maxmp,:atk,:def,:spi,:agi]
          fields.each { |k| quick(k.to_s.upcase,a.send(k)) { |v| a.send(k.to_s+'=',[v,0].max) } }
        end
      when :party
        quick(t(:gold),$game_party.gold) { |v| $game_party.gain_gold([v,0].max-$game_party.gold) }
        row(t(:save)) { RPGMToolkit.save_game; @done=true unless RPGMToolkit.battle? }
      when :teleport
        row(t(:search)+': '+@query) { prompt(t(:search),@query) { |s| @query=s; @scroll=0 } }
        RPGMToolkit.maps.keys.sort.each do |id|
          name=RPGMToolkit.maps[id].name; next unless (id.to_s+' '+name.downcase).include?(@query.downcase)
          row(id.to_s+' '+name) { prompt('X,Y','0,0') { |s| x,y=s.split(',').collect { |v| Integer(v) }; raise 'X,Y' unless y; RPGMToolkit.transfer(id,x,y); @done=true } }
        end
      when :history
        row(t(:undo)) { entry=RPGMToolkit.journal.pop; if entry then r,v,id=entry; RPGMToolkit.actor_id=id if id; RPGMToolkit.assign(r,v,false); end }
        RPGMToolkit.journal.reverse.each { |r,v,id| row(r[2].to_s+' <- '+v.to_s) {} }
      when :translations
        row(t(:english)+': '+RPGMToolkit.prefs['english'].to_s) { RPGMToolkit.prefs['english']=!RPGMToolkit.prefs['english']; RPGMToolkit.persist }
        row(t(:source)+': '+RPGMToolkit.prefs['source']) { prompt(t(:source),RPGMToolkit.prefs['source']) { |s| raise 'Code langue / Language code' unless s =~ /\A[a-z]{2}\z/; RPGMToolkit.prefs['source']=s; RPGMToolkit.persist } }
        row(t(:start)+' - MyMemory',RPGMToolkit.prefs['language']=='en' ? 'Send names to MyMemory' : 'Envoyer les noms a MyMemory') { RPGMToolkit.translate; @message=RPGMToolkit.translation_status }
        row(t(:stop)+' '+RPGMToolkit.translation_status) { RPGMToolkit.stop_translation }
        row(t(:export)) { RPGMToolkit.export_aliases; @message=DICTIONARY }
        row(t(:names)) { RPGMToolkit.export_aliases(true); @message='RPGMToolkit-names.tsv' }
        row(t(:import)) { RPGMToolkit.import_aliases; @message='OK' }
        row(t(:delete)) { prompt(t(:delete),'') { |s| raise 'OK' unless s=='OK'; RPGMToolkit.stop_translation; RPGMToolkit.prefs['aliases']={}; File.delete(DICTIONARY) if File.exist?(DICTIONARY); RPGMToolkit.persist } }
        row(t(:search)+': '+@query) { prompt(t(:search),@query) { |s| @query=s; @scroll=0 } }
        RPGMToolkit.records(@category).each { |r| next unless (r[1].to_s+' '+r[2].downcase).include?(@query.downcase); row(r[1].to_s+' '+RPGMToolkit.name(r)) { prompt('English',RPGMToolkit.name(r)) { |s| RPGMToolkit.prefs['aliases'][RPGMToolkit.key(r)]=[r[2],s]; RPGMToolkit.persist } } }
      when :settings
        row(t(:language)+': '+RPGMToolkit.prefs['language']) { RPGMToolkit.prefs['language']=RPGMToolkit.prefs['language']=='fr' ? 'en' : 'fr'; RPGMToolkit.persist }
        [['font',[14,18,22]],['rail',[18,24,32]],['rows',[20,40,60,80]]].each { |k,values| row(t(k=='rows' ? :page : k.to_sym)+': '+RPGMToolkit.prefs[k].to_s) { RPGMToolkit.prefs[k]=values[(values.index(RPGMToolkit.prefs[k])+1)%values.size]; RPGMToolkit.persist } }
        row(t(:launch)+': '+RPGMToolkit.prefs['launch'].to_s) { RPGMToolkit.prefs['launch']=!RPGMToolkit.prefs['launch']; RPGMToolkit.persist }
      end
    end
  end
end

module Graphics
  class << self
    alias rpgmt_update update
    def update
      rpgmt_update
      RPGMToolkit.tick
    end
  end
end
